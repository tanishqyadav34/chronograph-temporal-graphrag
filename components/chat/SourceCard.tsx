"use client";

import { Source } from "@/lib/types";
import { Slack, Github, Jira, ExternalLink } from "lucide-react";

const platformIcons: Record<Source["platform"], React.ElementType> = {
  slack: Slack,
  github: Github,
  jira: Jira,
};

const platformColors: Record<Source["platform"], string> = {
  slack: "#e01e5a",
  github: "#ffffff",
  jira: "#2684ff",
};

interface SourceCardProps {
  source: Source;
}

export default function SourceCard({ source }: SourceCardProps) {
  const Icon = platformIcons[source.platform];
  const color = platformColors[source.platform];

  return (
    <div className="group flex items-start gap-3 rounded-lg border border-chrono-border bg-chrono-surface-light/50 p-3 transition-all duration-200 hover:border-chrono-primary/30 hover:bg-chrono-surface-light">
      <div
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-chrono-text">
          {source.title}
        </p>
        <p className="mt-0.5 text-[10px] text-chrono-text-dim">
          {source.metadata}
        </p>
        <p className="mt-1 text-[11px] italic leading-relaxed text-chrono-text-muted">
          &ldquo;{source.excerpt}&rdquo;
        </p>
      </div>
      <button className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-chrono-text-muted opacity-0 transition-all duration-200 hover:bg-chrono-primary/10 hover:text-chrono-cyan group-hover:opacity-100">
        <ExternalLink className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
