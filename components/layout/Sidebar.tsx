"use client";

import { useState } from "react";
import {
  Plus,
  Slack,
  Github,
  Ticket,
  Settings,
  MessageSquare,
  Trash2,
  RefreshCw,
  Paperclip,
} from "lucide-react";
import { useChat } from "@/lib/chat-context";
import { useSession } from "next-auth/react";
import SettingsModal from "./SettingsModal";

interface SidebarProps {
  onNewConversation?: () => void;
}

function timeAgo(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function Sidebar({ onNewConversation }: SidebarProps) {
  const {
    conversations,
    activeId,
    selectConversation,
    removeConversation,
    newConversation,
  } = useChat();

  const [syncedMinutesAgo, setSyncedMinutesAgo] = useState<Record<string, number>>({
    slack: 120,
    github: 300,
    jira: 45,
  });
  const [syncing, setSyncing] = useState(false);

  const formatSync = (minutes: number) => {
    if (syncing) return "Syncing…";
    if (minutes <= 0) return "Synced just now";
    if (minutes < 60) return `Synced ${minutes}m ago`;
    return `Synced ${Math.round(minutes / 60)}h ago`;
  };

  const forceSync = () => {
    if (syncing) return;
    setSyncing(true);
    // Mock sync: reset all timestamps to "just now" after a short delay.
    setTimeout(() => {
      setSyncedMinutesAgo({ slack: 0, github: 0, jira: 0 });
      setSyncing(false);
    }, 900);
  };

  const handleNew = () => {
    // Let the page-level handler own creation (it also closes the mobile
    // drawer and switches to the chat tab). Falls back to context directly
    // if no handler is provided (e.g. standalone usage).
    if (onNewConversation) onNewConversation();
    else newConversation();
  };

  const dataSources = [
    { id: "slack", name: "Slack", icon: Slack, color: "#e01e5a" },
    { id: "github", name: "GitHub", icon: Github, color: "#8b949e" },
    { id: "jira", name: "Jira", icon: Ticket, color: "#2684ff" },
  ];

  return (
    <aside className="flex h-full w-64 flex-col border-r border-chrono-border bg-chrono-surface">
      {/* New Conversation */}
      <div className="p-3">
        <button
          onClick={handleNew}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-chrono-primary to-chrono-violet px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-chrono-primary/20 transition-all duration-200 hover:shadow-xl hover:shadow-chrono-primary/30 hover:brightness-110 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          New Conversation
        </button>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-chrono-text-dim">
          Recent Conversations
        </h3>
        <div className="space-y-0.5">
          {conversations.length === 0 && (
            <p className="px-3 py-2 text-xs text-chrono-text-dim">
              No conversations yet.
            </p>
          )}
          {conversations.map((conv) => {
            const isActive = conv.id === activeId;
            return (
              <div
                key={conv.id}
                role="button"
                tabIndex={0}
                onClick={() => selectConversation(conv.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectConversation(conv.id);
                  }
                }}
                className={`group relative flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-chrono-primary ${
                  isActive
                    ? "bg-chrono-primary/10 text-chrono-text"
                    : "text-chrono-text-muted hover:bg-chrono-surface-light hover:text-chrono-text"
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-chrono-primary" />
                )}
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                {conv.attachment && (
                  <Paperclip
                    className="mt-1 h-3 w-3 flex-shrink-0 text-chrono-cyan"
                    aria-label="Has attached file"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs leading-relaxed">
                    {conv.title}
                  </p>
                  <p
                    className="mt-0.5 text-[10px] text-chrono-text-dim"
                    suppressHydrationWarning
                  >
                    {timeAgo(conv.updatedAt)}
                  </p>
                </div>
                {conversations.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Delete conversation ${conv.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeConversation(conv.id);
                    }}
                    className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-chrono-text-dim opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Data Sources */}
        <div className="mb-2 mt-5 flex items-center justify-between pr-1">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-chrono-text-dim">
            Data Sources
          </h3>
          <button
            onClick={forceSync}
            disabled={syncing}
            className="rounded-md p-1 text-chrono-text-muted transition-colors hover:bg-chrono-surface-light hover:text-chrono-text disabled:opacity-50"
            aria-label="Force sync data sources"
            title="Force sync"
          >
            <RefreshCw
              className={`h-3 w-3 ${syncing ? "animate-spin text-chrono-primary" : ""}`}
            />
          </button>
        </div>
        <div className="space-y-1">
          {dataSources.map((source) => {
            const Icon = source.icon;
            return (
              <div
                key={source.id}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-chrono-text-muted"
              >
                <Icon
                  className="h-4 w-4 flex-shrink-0"
                  style={{ color: source.color }}
                />
                <span className="flex-1 text-xs font-medium">{source.name}</span>
                <span className="text-xs text-chrono-text-dim">
                  {formatSync(syncedMinutesAgo[source.id] ?? 0)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* User Profile */}
      <SidebarFooter />
    </aside>
  );
}

function SidebarFooter() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { data: session } = useSession();
  const user = session?.user;
  const name = user?.name || "Analyst";
  const role = user?.role || "";
  const initials =
    name
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";

  return (
    <>
      <div className="border-t border-chrono-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-[11px] font-bold text-white shadow-sm">
            {initials}
          </div>
          <div className="flex-1">
            <p className="truncate text-xs font-medium text-chrono-text">{name}</p>
            <p className="truncate text-[10px] text-chrono-text-dim">{role}</p>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-md p-1 text-chrono-text-muted transition-colors hover:bg-chrono-surface hover:text-chrono-text"
            aria-label="Open settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
