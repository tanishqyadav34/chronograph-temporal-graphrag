"use client";

import { useRef, useState, useEffect } from "react";
import {
  Moon,
  Sun,
  ChevronDown,
  Plus,
  Menu,
  Hexagon,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { useTheme } from "@/lib/theme-context";
import { useSession } from "next-auth/react";
import SettingsModal from "./SettingsModal";

interface NavbarProps {
  onMenuClick: () => void;
  onNewChat: () => void;
  onTogglePanel: () => void;
  panelCollapsed: boolean;
}

const REPOS = ["All Repositories", "security-monorepo", "frontend-app", "infra-tools"];

export default function Navbar({
  onMenuClick,
  onNewChat,
  onTogglePanel,
  panelCollapsed,
}: NavbarProps) {
  const { theme, toggleTheme } = useTheme();
  const darkMode = theme === "dark";
  const { data: session } = useSession();
  const user = session?.user;
  const avatarInitials =
    (user?.name || "U")
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState("All Repositories");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const repoRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click / Escape
  useEffect(() => {
    if (!repoDropdownOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (repoRef.current && !repoRef.current.contains(e.target as Node)) {
        setRepoDropdownOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRepoDropdownOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [repoDropdownOpen]);

  return (
    <nav className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-chrono-border bg-chrono-surface/80 px-4 backdrop-blur-md">
      {/* Left: Logo + Hamburger */}
      <div className="flex items-center gap-3">
        <button
          className="flex items-center justify-center lg:hidden"
          onClick={onMenuClick}
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5 text-chrono-text" />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-chrono-primary to-chrono-violet shadow-lg shadow-chrono-primary/20">
            <Hexagon className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-sm font-bold leading-tight tracking-tight text-chrono-text">
              ChronoGraph
            </h1>
            <p className="text-[10px] leading-tight text-chrono-text-muted">
              Intelligent Forensics Assistant
            </p>
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Repo dropdown */}
        <div className="relative hidden md:block" ref={repoRef}>
          <button
            onClick={() => setRepoDropdownOpen((o) => !o)}
            className="flex max-w-[180px] items-center gap-1.5 rounded-lg border border-chrono-border bg-chrono-surface-light px-3 py-1.5 text-xs font-medium text-chrono-text-muted transition-colors hover:border-chrono-border hover:text-chrono-text"
          >
            <span className="truncate">{selectedRepo}</span>
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
          </button>
          {repoDropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-chrono-border bg-chrono-surface py-1 shadow-xl">
              {REPOS.map((repo) => (
                <button
                  key={repo}
                  onClick={() => {
                    setSelectedRepo(repo);
                    setRepoDropdownOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors hover:bg-chrono-primary/10 hover:text-chrono-text ${
                    repo === selectedRepo
                      ? "text-chrono-primary"
                      : "text-chrono-text-muted"
                  }`}
                >
                  <span className="truncate">{repo}</span>
                  {repo === selectedRepo && (
                    <span className="ml-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-chrono-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* New Chat */}
        <button
          onClick={onNewChat}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-chrono-primary to-chrono-violet px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-chrono-primary/20 transition-all duration-200 hover:shadow-xl hover:shadow-chrono-primary/30 hover:brightness-110 active:scale-95"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">New Chat</span>
        </button>

        {/* Collapse / expand the right graph panel */}
        <button
          onClick={onTogglePanel}
          className="rounded-lg p-1.5 text-chrono-text-muted transition-colors hover:bg-chrono-surface-light hover:text-chrono-text"
          aria-label={panelCollapsed ? "Expand graph panel" : "Collapse graph panel"}
          title={panelCollapsed ? "Expand graph panel" : "Collapse graph panel"}
        >
          {panelCollapsed ? (
            <PanelRightOpen className="h-4 w-4" />
          ) : (
            <PanelRightClose className="h-4 w-4" />
          )}
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="rounded-lg p-1.5 text-chrono-text-muted transition-colors hover:bg-chrono-surface-light hover:text-chrono-text"
          aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
        >
          {darkMode ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
        </button>

        {/* Avatar — opens settings (also the only settings entry on mobile) */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-[11px] font-bold text-white shadow-sm transition-transform hover:scale-105 active:scale-95"
          aria-label="Open settings"
          title={user ? `${user.name} — settings` : "Settings"}
        >
          {avatarInitials}
        </button>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </nav>
  );
}
