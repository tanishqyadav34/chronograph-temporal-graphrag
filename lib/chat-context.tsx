"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { Message, AttachmentPayload } from "./types";
import { useSession } from "next-auth/react";

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string; // ISO string
  messages: Message[];
  /**
   * Conversation-scoped file: once attached, every question in this
   * conversation is answered from this document until it is removed.
   * Content may be truncated on persistence (see PERSIST caps below).
   */
  attachment?: AttachmentPayload;
}

interface ChatContextValue {
  conversations: Conversation[];
  activeId: string;
  activeConversation: Conversation;
  pending: boolean;
  sendMessage: (text: string, attachment?: AttachmentPayload) => void;
  stopGeneration: () => void;
  newConversation: () => void;
  selectConversation: (id: string) => void;
  removeConversation: (id: string) => void;
  /** Attach (or remove, with null) the file that scopes this conversation. */
  setConversationAttachment: (attachment: AttachmentPayload | null) => void;
}

/** localStorage key per signed-in user — conversations never leak across accounts. */
function storageKeyFor(userId: string): string {
  return `chrono-conversations-v1-${userId}`;
}

// Persistence caps: the server only ever uses the first 15k chars of text
// context, so storing more is wasted quota. Base64 (PDFs) is kept only while
// small enough to fit comfortably in localStorage; oversized PDFs keep their
// content in memory for the session and show a "re-attach" hint after reload.
const PERSIST_TEXT_CAP = 20_000;
const PERSIST_BASE64_CAP = 250_000;

/** Trim attachment payloads before persisting so localStorage stays small. */
function persistableConversation(conv: Conversation): Conversation {
  if (!conv.attachment) return conv;
  const { name, type, content, base64 } = conv.attachment;
  return {
    ...conv,
    attachment: {
      name,
      type,
      ...(content ? { content: content.slice(0, PERSIST_TEXT_CAP) } : {}),
      ...(base64 && base64.length <= PERSIST_BASE64_CAP ? { base64 } : {}),
    },
  };
}

function makeWelcomeMessage(): Message {
  return {
    id: "welcome",
    role: "assistant",
    content:
      "Hi! I can answer questions about the engineering history captured in our knowledge graph — Jira tickets, Git commits, and Slack discussions. What would you like to know?",
    timestamp: new Date().toISOString(),
    sources: [],
  };
}

function makeConversation(id: string): Conversation {
  return {
    id,
    title: "New Conversation",
    updatedAt: new Date().toISOString(),
    messages: [makeWelcomeMessage()],
  };
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [pending, setPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // The persist effect must never write one user's conversations under
  // another user's storage key. `pendingKey` is set by the load effect for
  // the key whose data it just read; once those conversations actually
  // commit, the promote effect moves it to `loadedKey` — so a persist in the
  // same commit (before the state lands) still sees the old key and skips.
  const pendingKey = useRef<string | null>(null);
  const loadedKey = useRef<string | null>(null);

  // Conversations are scoped per signed-in user: each account gets its own
  // localStorage key, so switching users never leaks another account's list.
  const { data: session, status } = useSession();
  const userId =
    status === "authenticated" ? (session?.user?.email ?? null) : null;
  const storageKey = userId ? storageKeyFor(userId) : null;

  // Load (or seed) the conversation list whenever the signed-in user changes.
  useEffect(() => {
    if (!userId) return;
    const key = storageKeyFor(userId);
    pendingKey.current = key;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Conversation[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setConversations(parsed);
          setActiveId(parsed[0].id);
          return;
        }
      }
    } catch {
      // corrupted storage — fall through to fresh seed
    }
    const seed = makeConversation(`conv-${Date.now()}`);
    setConversations([seed]);
    setActiveId(seed.id);
  }, [userId]);

  // Once the loaded conversations commit, they are safe to persist.
  useEffect(() => {
    if (pendingKey.current) {
      loadedKey.current = pendingKey.current;
      pendingKey.current = null;
    }
  }, [conversations]);

  // Persist on every change — only for the user whose data is currently
  // committed. Skip while the list is still empty so we never clobber saved
  // history with the initial empty state.
  useEffect(() => {
    if (
      !storageKey ||
      loadedKey.current !== storageKey ||
      conversations.length === 0
    ) {
      return;
    }
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify(conversations.map(persistableConversation))
      );
    } catch {
      // quota / unavailable — ignore
    }
  }, [storageKey, conversations]);

  // If the active conversation disappears (e.g. deleted), fall back to the first.
  useEffect(() => {
    if (conversations.length > 0 && !conversations.some((c) => c.id === activeId)) {
      setActiveId(conversations[0].id);
    }
  }, [conversations, activeId]);

  const activeConversation =
    conversations.find((c) => c.id === activeId) ??
    conversations[0] ??
    makeConversation("empty");

  const sendMessage = useCallback(
    async (text: string, attachment?: AttachmentPayload) => {
      const targetId = activeId;
      if (!targetId) return;
      const now = new Date().toISOString();

      // Conversation-scoped attachment: an explicitly attached file replaces
      // the conversation's stored one; otherwise reuse the stored one so every
      // question in a file conversation keeps the same document as context
      // without re-attaching it.
      const storedAttachment = conversations.find((c) => c.id === targetId)?.attachment;
      const effectiveAttachment = attachment ?? storedAttachment;

      const userMessage: Message = {
        id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: "user",
        content: text,
        timestamp: now,
        sources: [],
        attachment: effectiveAttachment ? { name: effectiveAttachment.name } : undefined,
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === targetId
            ? {
                ...c,
                title:
                  c.title === "New Conversation" ? text.slice(0, 60) : c.title,
                updatedAt: now,
                // New file selection replaces the stored one; otherwise keep it.
                attachment: attachment ?? c.attachment,
                messages: [...c.messages, userMessage],
              }
            : c
        )
      );
      setPending(true);

      const controller = new AbortController();
      abortRef.current = controller;

      let assistantMessage: Message;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text, attachment: effectiveAttachment }),
          signal: controller.signal,
        });
        // A stale session makes the middleware bounce /api/chat to /login;
        // surface that clearly instead of failing to parse the login HTML.
        if (res.redirected) {
          throw new Error("Your session expired — please log in again.");
        }
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || data.answer || "Request failed");
        }
        assistantMessage = {
          id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: "assistant",
          content: data.answer,
          timestamp: new Date().toISOString(),
          sources: Array.isArray(data.sources) ? data.sources : [],
        };
      } catch (err) {
        const aborted = err instanceof Error && err.name === "AbortError";
        assistantMessage = {
          id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: "assistant",
          content: aborted
            ? "⏹ Generation stopped."
            : `Sorry, I hit an error: ${
                err instanceof Error ? err.message : "unknown error"
              }`,
          timestamp: new Date().toISOString(),
          sources: [],
        };
      }

      abortRef.current = null;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === targetId
            ? { ...c, updatedAt: new Date().toISOString(), messages: [...c.messages, assistantMessage] }
            : c
        )
      );
      setPending(false);
    },
    [activeId, conversations]
  );

  const setConversationAttachment = useCallback(
    (attachment: AttachmentPayload | null) => {
      const targetId = activeId;
      if (!targetId) return;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === targetId
            ? { ...c, attachment: attachment ?? undefined, updatedAt: new Date().toISOString() }
            : c
        )
      );
    },
    [activeId]
  );

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const newConversation = useCallback(() => {
    const conv = makeConversation(`conv-${Date.now()}`);
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
  }, []);

  const selectConversation = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const removeConversation = useCallback(
    (id: string) => {
      if (conversations.length <= 1) return; // never delete the last conversation
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        const remaining = conversations.filter((c) => c.id !== id);
        setActiveId(remaining[0]?.id ?? "");
      }
    },
    [conversations, activeId]
  );

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeId,
        activeConversation,
        pending,
        sendMessage,
        stopGeneration,
        newConversation,
        selectConversation,
        removeConversation,
        setConversationAttachment,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within a ChatProvider");
  return ctx;
}
