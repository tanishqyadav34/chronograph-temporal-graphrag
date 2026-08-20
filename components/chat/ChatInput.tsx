"use client";

import { useState, useRef, KeyboardEvent, ChangeEvent } from "react";
import { Send, Paperclip, X, Square, AlertCircle } from "lucide-react";
import { useChat } from "@/lib/chat-context";

interface ChatInputProps {
  onSend: (question: string) => void;
  onStop?: () => void;
  disabled?: boolean;
}

const ACCEPT =
  ".txt,.md,.markdown,.json,.csv,.log,.pdf,.ts,.tsx,.js,.jsx,.py,.yaml,.yml,.xml,.html,.css";
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      resolve(dataUrl.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Read a text file respecting its real encoding. `file.text()` always decodes
 * UTF-8, which silently turns Windows Notepad "Unicode" (UTF-16) datasets into
 * mojibake — the graph parser then sees zero records. We sniff the BOM (and
 * fall back to UTF-16LE / windows-1252 heuristics) so any txt/md/csv/log from
 * any editor decodes correctly.
 */
async function readFileText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);

  // UTF-32 LE / UTF-16 LE with BOM
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    if (bytes.length >= 4 && bytes[2] === 0 && bytes[3] === 0) {
      try {
        return new TextDecoder("utf-32le").decode(buf.slice(4));
      } catch {
        // utf-32 isn't a standard browser decoder — fall through to utf-16le
      }
    }
    return new TextDecoder("utf-16le").decode(buf.slice(2));
  }
  // UTF-16 BE with BOM
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buf.slice(2));
  }
  // UTF-8 with BOM
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(buf.slice(3));
  }

  // No BOM: if the first bytes contain NULs in ASCII range it's almost
  // certainly BOM-less UTF-16 (little-endian on Windows) — decode as such.
  const probe = bytes.slice(0, Math.min(bytes.length, 4096));
  let hasNul = false;
  for (let i = 0; i < probe.length; i++) {
    if (probe[i] === 0) {
      hasNul = true;
      break;
    }
  }
  if (hasNul) {
    try {
      const t = new TextDecoder("utf-16le").decode(buf);
      // sanity: decoded text should be mostly printable
      if (!/\uFFFD/.test(t)) return t;
    } catch {
      // fall through to utf-8
    }
  }

  // Default UTF-8; if it produced replacement chars, retry as windows-1252
  // (Notepad "ANSI" saves), which never fails to decode.
  const utf8 = new TextDecoder("utf-8").decode(buf);
  if (utf8.includes("\uFFFD")) {
    try {
      return new TextDecoder("windows-1252").decode(buf);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

export default function ChatInput({ onSend, onStop, disabled = false }: ChatInputProps) {
  const { activeConversation, setConversationAttachment } = useChat();
  const [value, setValue] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileErrorFlash, setFileErrorFlash] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileErrorRef = useRef<HTMLDivElement>(null);

  // The file attached to THIS conversation. It persists across every question
  // in the conversation until the user removes it — attach once, ask many.
  const convoAttachment = activeConversation.attachment;
  // After a reload an oversized PDF may have lost its content in storage; the
  // name still shows but the file must be re-attached to be usable again.
  const needsReattach =
    !!convoAttachment && !convoAttachment.content && !convoAttachment.base64;

  const handleSubmit = () => {
    if (!value.trim() || disabled) return;
    // Never silently drop the attachment: if the selected file failed to
    // read, require the user to dismiss/remove it before sending.
    if (fileError) {
      // Visible feedback so Enter doesn't feel dead while sending is blocked.
      setFileErrorFlash(true);
      fileErrorRef.current?.focus();
      setTimeout(() => setFileErrorFlash(false), 700);
      return;
    }
    if (needsReattach) {
      // After a reload an oversized PDF may have lost its content — guide the
      // user to re-attach instead of silently failing on the server.
      setFileError(
        `"${convoAttachment?.name}" must be re-attached after a page reload — pick it again with the paperclip button.`
      );
      setFileErrorFlash(true);
      setTimeout(() => setFileErrorFlash(false), 700);
      return;
    }
    // The conversation's stored attachment (if any) is sent by the context.
    onSend(value.trim());
    setValue("");
    setFileError(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so selecting the same file again re-triggers onChange
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_FILE_BYTES) {
      // Drop any previously selected file so the chip and error never contradict.
      setConversationAttachment(null);
      setFileError("File is too large (max 5 MB).");
      return;
    }
    setFileError(null);

    try {
      if (file.type === "application/pdf") {
        const base64 = await fileToBase64(file);
        setConversationAttachment({ name: file.name, type: "application/pdf", base64 });
      } else {
        const content = await readFileText(file);
        setConversationAttachment({
          name: file.name,
          type: file.type || "text/plain",
          content,
        });
      }
    } catch {
      setFileError("Could not read that file. Try a different one.");
    }
  };

  return (
    <div className="border-t border-chrono-border bg-chrono-surface/90 px-4 py-3 backdrop-blur-md">
      <div className="mx-auto max-w-3xl">
        {/* Conversation file chip */}
        {convoAttachment && (
          <div
            title="This file is the context for this conversation — every question here is answered from it. Remove it to ask about the knowledge graph instead."
            className="mb-2 flex items-center gap-2 rounded-lg border border-chrono-border bg-chrono-surface-light px-3 py-1.5"
          >
            <Paperclip className="h-3 w-3 flex-shrink-0 text-chrono-cyan" />
            <span className="min-w-0 flex-1 truncate text-xs text-chrono-text">
              {convoAttachment.name}
            </span>
            {needsReattach && (
              <span className="text-[10px] text-amber-400/80">re-attach to restore</span>
            )}
            <span className="text-[10px] text-chrono-text-dim">
              {convoAttachment.base64 ? "PDF" : "text"}
            </span>
            <button
              onClick={() => {
                setConversationAttachment(null);
                setFileError(null);
              }}
              className="rounded p-0.5 text-chrono-text-muted transition-colors hover:bg-chrono-surface hover:text-chrono-text"
              aria-label="Remove attachment"
              title="Remove file — questions will use the knowledge graph again"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        {fileError && (
          <div
            ref={fileErrorRef}
            tabIndex={-1}
            className={`mb-2 flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 outline-none transition-shadow ${
              fileErrorFlash ? "shadow-[0_0_0_2px_rgba(248,113,113,0.35)]" : ""
            }`}
          >
            <AlertCircle className="h-3 w-3 flex-shrink-0" />
            <span className="min-w-0 flex-1">{fileError}</span>
            <button
              onClick={() => setFileError(null)}
              className="rounded p-0.5 text-red-400/70 transition-colors hover:bg-red-500/20 hover:text-red-300"
              aria-label="Dismiss file error"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 rounded-2xl border border-chrono-border bg-chrono-surface-light px-3 py-2 transition-all duration-200 focus-within:border-chrono-primary/50 focus-within:shadow-lg focus-within:shadow-chrono-primary/10">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={handleFileChange}
          />
          {/* Attachments — left side of the input */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-chrono-text-muted transition-colors hover:bg-chrono-surface hover:text-chrono-text disabled:opacity-40"
            aria-label="Attach a file"
            title={
              convoAttachment
                ? `Replace ${convoAttachment.name}`
                : "Attach a file (.txt, .md, .json, .csv, .log, .pdf)"
            }
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={
              disabled
                ? "ChronoGraph is thinking..."
                : convoAttachment
                ? `Ask about ${convoAttachment.name}...`
                : "Ask anything about our engineering history..."
            }
            rows={1}
            className="min-h-[24px] flex-1 resize-none bg-transparent text-sm text-chrono-text placeholder-chrono-text-dim outline-none scrollbar-thin"
          />
          {/* Stop Generation — replaces the send button while loading */}
          {disabled ? (
            <button
              onClick={onStop}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-chrono-border bg-chrono-surface text-chrono-text-muted transition-all duration-200 hover:border-chrono-primary/50 hover:text-chrono-text active:scale-95"
              aria-label="Stop generation"
              title="Stop generation"
            >
              <Square className="h-3 w-3 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!value.trim() || !!fileError}
              title={fileError ? "Remove the failed attachment to send" : undefined}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-chrono-primary to-chrono-violet text-white shadow-lg shadow-chrono-primary/20 transition-all duration-200 hover:shadow-xl hover:shadow-chrono-primary/30 hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {convoAttachment && (
          <p className="mt-1.5 text-center text-[10px] text-chrono-text-dim">
            This file stays attached for all questions in this conversation —
            remove it to ask about the knowledge graph.
          </p>
        )}
        {!convoAttachment && (
          <p className="mt-2 text-center text-[10px] text-chrono-text-dim">
            ChronoGraph can make mistakes. Verify important information.
          </p>
        )}
      </div>
    </div>
  );
}
