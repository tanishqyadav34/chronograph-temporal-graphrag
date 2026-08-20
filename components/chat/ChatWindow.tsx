"use client";

import { useRef, useEffect } from "react";
import { Hexagon, ArrowRight } from "lucide-react";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import { useChat } from "@/lib/chat-context";
import { useHighlight } from "@/lib/highlight-context";

const SUGGESTED_QUERIES = [
  "Why did we switch from AWS to GCP in 2023?",
  "Who advocated for Cloud SQL over Redshift?",
  "Summarize the database migration debates from Q1.",
];

export default function ChatWindow() {
  const { activeConversation, pending, sendMessage, stopGeneration } = useChat();
  const { setHighlight } = useHighlight();
  const messages = activeConversation.messages;
  const bottomRef = useRef<HTMLDivElement>(null);

  const hasUserMessages = messages.some((m) => m.role === "user");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  // Switching conversations unmounts any hovered citation pill without firing
  // onMouseLeave, so clear the cross-pane highlight explicitly.
  useEffect(() => {
    setHighlight(null);
  }, [activeConversation.id, setHighlight]);

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4">
        <div className="mx-auto max-w-3xl space-y-6">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {/* Suggested queries — shown until the user asks their first question */}
          {!hasUserMessages && (
            <div className="grid gap-3 sm:grid-cols-3">
              {SUGGESTED_QUERIES.map((query) => (
                <button
                  key={query}
                  onClick={() => sendMessage(query)}
                  disabled={pending}
                  className="group rounded-xl border border-chrono-border bg-chrono-surface-light p-4 text-left transition-all duration-200 hover:border-chrono-primary/40 hover:bg-chrono-surface hover:shadow-lg hover:shadow-chrono-primary/5 disabled:opacity-50"
                >
                  <p className="text-xs font-medium leading-relaxed text-chrono-text">
                    {query}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-chrono-cyan transition-colors group-hover:text-teal-300">
                    Ask ChronoGraph
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Typing indicator */}
          {pending && (
            <div className="flex gap-3">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-chrono-primary to-chrono-violet">
                <Hexagon className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
              </div>
              <div className="flex items-center gap-1 rounded-2xl border border-chrono-border bg-chrono-surface-light px-4 py-3">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-chrono-text-dim"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input — keyed by conversation so drafts/attachments never leak
          across conversations and remount cleanly on switch */}
      <ChatInput
        key={activeConversation.id}
        onSend={sendMessage}
        onStop={stopGeneration}
        disabled={pending}
      />
    </div>
  );
}
