"use client";

import { useState } from "react";
import { Message } from "@/lib/types";
import { ChevronDown, Hexagon, User } from "lucide-react";
import SourceCard from "./SourceCard";

interface MessageBubbleProps {
  message: Message;
}

function formatContent(content: string) {
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];
  let inTable = false;
  let tableRows: string[] = [];

  const flushTable = () => {
    if (tableRows.length > 0) {
      elements.push(
        <div key={`table-${elements.length}`} className="my-2 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            {tableRows.map((row, ri) => {
              const cells = row
                .split("|")
                .filter((c) => c.trim())
                .map((c) => c.trim());
              if (ri === 0) {
                return (
                  <thead key={ri}>
                    <tr>
                      {cells.map((cell, ci) => (
                        <th
                          key={ci}
                          className="border border-chrono-border px-2 py-1 text-left font-semibold text-chrono-text"
                        >
                          {cell}
                        </th>
                      ))}
                    </tr>
                  </thead>
                );
              }
              if (ri === 1 && cells.every((c) => /^[-:]+$/.test(c))) {
                return null; // separator row
              }
              return (
                <tr key={ri}>
                  {cells.map((cell, ci) => (
                    <td
                      key={ci}
                      className="border border-chrono-border px-2 py-1 text-chrono-text-muted"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              );
            })}
          </table>
        </div>
      );
      tableRows = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("|")) {
      inTable = true;
      tableRows.push(trimmed);
      continue;
    }

    if (inTable) {
      flushTable();
      inTable = false;
    }

    if (trimmed === "") {
      elements.push(<br key={`br-${i}`} />);
    } else if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
      elements.push(
        <p key={i} className="mb-2 font-semibold text-chrono-text">
          {trimmed.replace(/\*\*/g, "")}
        </p>
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("✅ ")) {
      elements.push(
        <li key={i} className="ml-4 list-none text-sm leading-relaxed text-chrono-text-muted">
          {trimmed}
        </li>
      );
    } else {
      elements.push(
        <p key={i} className="mb-1.5 last:mb-0 text-sm leading-relaxed text-chrono-text-muted">
          {trimmed}
        </p>
      );
    }
  }

  if (inTable) {
    flushTable();
  }

  return elements;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-gradient-to-br from-cyan-400 to-blue-600"
            : "bg-gradient-to-br from-chrono-primary to-chrono-violet"
        }`}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5 text-white" />
        ) : (
          <Hexagon className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
        )}
      </div>

      {/* Content */}
      <div className={`max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
        {/* Header */}
        {!isUser && (
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-semibold text-chrono-text">
              ChronoGraph
            </span>
            <span className="text-[10px] text-chrono-text-dim">
              {message.timestamp}
            </span>
          </div>
        )}

        {/* Bubble */}
        <div
          className={`rounded-2xl px-4 py-3 ${
            isUser
              ? "bg-gradient-to-r from-chrono-primary to-chrono-violet text-white shadow-lg shadow-chrono-primary/20"
              : "bg-chrono-surface-light border border-chrono-border text-chrono-text"
          }`}
        >
          <div className="prose prose-invert max-w-none">
            {formatContent(message.content)}
          </div>
        </div>

        {/* Timestamp for user */}
        {isUser && (
          <p className="mt-1 px-1 text-[10px] text-chrono-text-dim">
            {message.timestamp}
          </p>
        )}

        {/* Sources */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setSourcesOpen(!sourcesOpen)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-chrono-cyan transition-colors hover:text-cyan-300"
            >
              <ChevronDown
                className={`h-3 w-3 transition-transform duration-200 ${
                  sourcesOpen ? "rotate-0" : "-rotate-90"
                }`}
              />
              Sources ({message.sources.length})
            </button>
            {sourcesOpen && (
              <div className="mt-2 space-y-2">
                {message.sources.map((source) => (
                  <SourceCard key={source.id} source={source} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
