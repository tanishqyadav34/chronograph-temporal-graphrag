"use client";

import { useState } from "react";
import {
  Moon,
  Sun,
  ChevronDown,
  Plus,
  Menu,
  Hexagon,
} from "lucide-react";

interface NavbarProps {
  onMenuClick: () => void;
}

export default function Navbar({ onMenuClick }: NavbarProps) {
  const [darkMode, setDarkMode] = useState(true);
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);

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
        <div className="relative hidden md:block">
          <button
            onClick={() => setRepoDropdownOpen(!repoDropdownOpen)}
            className="flex items-center gap-1.5 rounded-lg border border-chrono-border bg-chrono-surface-light px-3 py-1.5 text-xs font-medium text-chrono-text-muted transition-colors hover:border-chrono-border hover:text-chrono-text"
          >
            <span>All Repositories</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {repoDropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-chrono-border bg-chrono-surface shadow-xl">
              <div className="py-1">
                {["All Repositories", "security-monorepo", "frontend-app", "infra-tools"].map(
                  (repo) => (
                    <button
                      key={repo}
                      onClick={() => setRepoDropdownOpen(false)}
                      className="w-full px-3 py-1.5 text-left text-xs text-chrono-text-muted transition-colors hover:bg-chrono-primary/10 hover:text-chrono-text"
                    >
                      {repo}
                    </button>
                  )
                )}
              </div>
            </div>
          )}
        </div>

        {/* New Chat */}
        <button className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-chrono-primary to-chrono-violet px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-chrono-primary/20 transition-all duration-200 hover:shadow-xl hover:shadow-chrono-primary/30 hover:brightness-110 active:scale-95">
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">New Chat</span>
        </button>

        {/* Theme toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="rounded-lg p-1.5 text-chrono-text-muted transition-colors hover:bg-chrono-surface-light hover:text-chrono-text"
          aria-label="Toggle theme"
        >
          {darkMode ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
        </button>

        {/* Avatar */}
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-[11px] font-bold text-white shadow-sm">
          AS
        </div>
      </div>
    </nav>
  );
}
