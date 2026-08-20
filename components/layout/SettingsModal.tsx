"use client";

import { useState } from "react";
import { X, Moon, Sun, User as UserIcon, Mail, LogOut } from "lucide-react";
import { useTheme } from "@/lib/theme-context";
import { useSession, signOut } from "next-auth/react";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

interface ToggleState {
  slack: boolean;
  github: boolean;
  jira: boolean;
}

const ROWS: { key: keyof ToggleState; label: string; desc: string }[] = [
  {
    key: "slack",
    label: "Slack sources",
    desc: "Include Slack messages in chat context",
  },
  {
    key: "github",
    label: "GitHub sources",
    desc: "Include Git commits in chat context",
  },
  {
    key: "jira",
    label: "Jira sources",
    desc: "Include Jira tickets in chat context",
  },
];

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { theme, toggleTheme } = useTheme();
  const { data: session } = useSession();
  const user = session?.user;
  const name = user?.name || "Analyst";
  const role = user?.role || "";
  const email = user?.email || "";
  const initials =
    name
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";
  const [toggles, setToggles] = useState<ToggleState>({
    slack: true,
    github: true,
    jira: true,
  });

  if (!open) return null;

  const toggle = (key: keyof ToggleState) =>
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-chrono-border bg-chrono-surface p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-chrono-text">Settings</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-chrono-text-muted transition-colors hover:bg-chrono-surface-light hover:text-chrono-text"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* User info */}
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-chrono-border bg-chrono-surface-light/60 p-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-xs font-bold text-white shadow-sm">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-chrono-text">{name}</p>
            <p className="truncate text-[11px] text-chrono-text-muted">{role}</p>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-chrono-text-dim">
              <Mail className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{email}</span>
            </p>
          </div>
        </div>

        {/* Appearance */}
        <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-chrono-text-dim">
          Appearance
        </h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            onClick={() => theme !== "light" && toggleTheme()}
            className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
              theme === "light"
                ? "border-chrono-primary bg-chrono-primary/10 text-chrono-primary"
                : "border-chrono-border bg-chrono-surface-light/60 text-chrono-text-muted hover:text-chrono-text"
            }`}
          >
            <Sun className="h-3.5 w-3.5" />
            Light
          </button>
          <button
            onClick={() => theme !== "dark" && toggleTheme()}
            className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
              theme === "dark"
                ? "border-chrono-primary bg-chrono-primary/10 text-chrono-primary"
                : "border-chrono-border bg-chrono-surface-light/60 text-chrono-text-muted hover:text-chrono-text"
            }`}
          >
            <Moon className="h-3.5 w-3.5" />
            Dark
          </button>
        </div>

        {/* Data sources */}
        <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-chrono-text-dim">
          Data Sources
        </h3>
        <div className="mt-2 space-y-3">
          {ROWS.map((row) => (
            <div
              key={row.key}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-chrono-surface-light/60"
              onClick={() => toggle(row.key)}
            >
              <div>
                <p className="text-xs font-medium text-chrono-text">
                  {row.label}
                </p>
                <p className="text-[10px] text-chrono-text-dim">{row.desc}</p>
              </div>
              <button
                role="switch"
                aria-checked={toggles[row.key]}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(row.key);
                }}
                className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
                  toggles[row.key] ? "bg-chrono-primary" : "bg-chrono-border"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                    toggles[row.key] ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>

        {/* Log out */}
        <button
          onClick={() =>
            signOut({ callbackUrl: "/login" }).then(() => onClose())
          }
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 py-2 text-xs font-semibold text-red-400 transition-all duration-200 hover:bg-red-500/20 active:scale-[0.98]"
        >
          <LogOut className="h-3.5 w-3.5" />
          Log out
        </button>

        <button
          onClick={onClose}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-chrono-primary to-chrono-violet py-2 text-xs font-semibold text-white shadow-lg shadow-chrono-primary/20 transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
        >
          <UserIcon className="h-3.5 w-3.5" />
          Done
        </button>
      </div>
    </div>
  );
}
