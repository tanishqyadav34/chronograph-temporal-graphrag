"use client";

import { useState, useRef, KeyboardEvent, ChangeEvent } from "react";
import { Send, Paperclip, X, Square, AlertCircle } from "lucide-react";
import { AttachmentPayload } from "@/lib/types";

interface ChatInputProps {
  onSend: (question: string, attachment?: AttachmentPayload) => void;
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

export default function ChatInput({ onSend, onStop, disabled = false }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [attachment, setAttachment] = useState<AttachmentPayload | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (!value.trim() || disabled) return;
    onSend(value.trim(), attachment ?? undefined);
    setValue("");
    setAttachment(null);
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
      setFileError("File is too large (max 5 MB).");
      return;
    }
    setFileError(null);

    try {
      if (file.type === "application/pdf") {
        const base64 = await fileToBase64(file);
        setAttachment({ name: file.name, type: "application/pdf", base64 });
      } else {
        const content = await file.text();
        setAttachment({
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
        {/* Attached file chip */}
        {attachment && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-chrono-border bg-chrono-surface-light px-3 py-1.5">
            <Paperclip className="h-3 w-3 flex-shrink-0 text-chrono-cyan" />
            <span className="min-w-0 flex-1 truncate text-xs text-chrono-text">
              {attachment.name}
            </span>
            <span className="text-[10px] text-chrono-text-dim">
              {attachment.base64 ? "PDF" : "text"}
            </span>
            <button
              onClick={() => {
                setAttachment(null);
                setFileError(null);
              }}
              className="rounded p-0.5 text-chrono-text-muted transition-colors hover:bg-chrono-surface hover:text-chrono-text"
              aria-label="Remove attachment"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        {fileError && (
          <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-400">
            <AlertCircle className="h-3 w-3 flex-shrink-0" />
            {fileError}
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
            title="Attach a file (.txt, .md, .json, .csv, .log, .pdf)"
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
                : attachment
                ? `Ask about ${attachment.name}...`
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
              disabled={!value.trim()}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-chrono-primary to-chrono-violet text-white shadow-lg shadow-chrono-primary/20 transition-all duration-200 hover:shadow-xl hover:shadow-chrono-primary/30 hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-[10px] text-chrono-text-dim">
          ChronoGraph can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}
