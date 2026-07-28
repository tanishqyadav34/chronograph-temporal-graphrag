"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { Send, Paperclip } from "lucide-react";

export default function ChatInput() {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (!value.trim()) return;
    // Mock: just clear the input
    setValue("");
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

  return (
    <div className="border-t border-chrono-border bg-chrono-surface/90 px-4 py-3 backdrop-blur-md">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl border border-chrono-border bg-chrono-surface-light px-3 py-2 transition-all duration-200 focus-within:border-chrono-primary/50 focus-within:shadow-lg focus-within:shadow-chrono-primary/10">
          <button className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-chrono-text-muted transition-colors hover:bg-chrono-surface hover:text-chrono-text">
            <Paperclip className="h-4 w-4" />
          </button>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="Ask anything about our engineering history..."
            rows={1}
            className="min-h-[24px] flex-1 resize-none bg-transparent text-sm text-chrono-text placeholder-chrono-text-dim outline-none scrollbar-thin"
          />
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-chrono-primary to-chrono-violet text-white shadow-lg shadow-chrono-primary/20 transition-all duration-200 hover:shadow-xl hover:shadow-chrono-primary/30 hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-chrono-text-dim">
          ChronoGraph can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}
