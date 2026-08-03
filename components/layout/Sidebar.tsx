"use client";

import { useState } from "react";
import {
  Plus,
  Slack,
  Github,
  Jira,
  ChevronRight,
  Settings,
  User,
  MessageSquare,
} from "lucide-react";
import { mockConversations } from "@/lib/mockConversations";

export default function Sidebar() {
  const [activeConv, setActiveConv] = useState("conv-1");

  const dataSources = [
    { id: "slack", name: "Slack", icon: Slack, color: "#e01e5a" },
    { id: "github", name: "GitHub", icon: Github, color: "#ffffff" },
    { id: "jira", name: "Jira", icon: Jira, color: "#2684ff" },
  ];

  return (
    <aside className="flex h-full w-64 flex-col border-r border-chrono-border bg-chrono-surface">
      {/* New Conversation */}
      <div className="p-3">
        <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-chrono-primary to-chrono-violet px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-chrono-primary/20 transition-all duration-200 hover:shadow-xl hover:shadow-chrono-primary/30 hover:brightness-110 active:scale-[0.98]">
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
          {mockConversations.map((conv) => {
            const isActive = conv.id === activeConv;
            return (
              <button
                key={conv.id}
                onClick={() => setActiveConv(conv.id)}
                className={`group relative flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-all duration-150 ${
                  isActive
                    ? "bg-chrono-primary/10 text-chrono-text"
                    : "text-chrono-text-muted hover:bg-chrono-surface-light hover:text-chrono-text"
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-chrono-primary" />
                )}
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs leading-relaxed">
                    {conv.title}
                  </p>
                  <p className="mt-0.5 text-[10px] text-chrono-text-dim">
                    {conv.updatedAt}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <button className="mt-2 w-full py-2 text-xs font-medium text-chrono-cyan transition-colors hover:text-cyan-300">
          View all conversations →
        </button>

        {/* Data Sources */}
        <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-chrono-text-dim">
          Data Sources
        </h3>
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
                <span className="text-[10px] text-chrono-text-dim">Connected</span>
                <span className="h-1.5 w-1.5 rounded-full bg-chrono-green shadow-sm shadow-chrono-green/50" />
              </div>
            );
          })}
        </div>
      </div>

      {/* User Profile */}
      <div className="border-t border-chrono-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-chrono-surface-light">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-[11px] font-bold text-white shadow-sm">
            AS
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-chrono-text">Alex Stevens</p>
            <p className="text-[10px] text-chrono-text-dim">View Profile</p>
          </div>
          <button className="rounded-md p-1 text-chrono-text-muted transition-colors hover:bg-chrono-surface hover:text-chrono-text">
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
