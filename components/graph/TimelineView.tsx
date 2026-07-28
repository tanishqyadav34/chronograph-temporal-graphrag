"use client";

import { mockTimelineEvents } from "@/lib/mockGraph";
import { Slack, Github, Jira } from "lucide-react";

const refIcons: Record<string, React.ElementType> = {
  slack: Slack,
  github: Github,
  jira: Jira,
};

const refColors: Record<string, string> = {
  slack: "#e01e5a",
  github: "#ffffff",
  jira: "#2684ff",
};

export default function TimelineView() {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin px-4 py-4">
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[68px] top-2 h-[calc(100%-16px)] w-px bg-gradient-to-b from-chrono-primary/40 via-chrono-violet/20 to-transparent" />

        <div className="space-y-0">
          {mockTimelineEvents.map((event, idx) => {
            const Icon = refIcons[event.referenceType];
            const color = refColors[event.referenceType];
            const isLast = idx === mockTimelineEvents.length - 1;

            return (
              <div key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
                {/* Dot */}
                <div className="relative z-10 flex w-16 flex-shrink-0 items-start justify-end pt-0.5">
                  <span className="text-[11px] font-medium text-chrono-text-dim">
                    {event.date}
                  </span>
                </div>

                <div className="relative z-10 flex-shrink-0 pt-0.5">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-chrono-primary/30 bg-chrono-surface shadow-sm">
                    <div className="h-2 w-2 rounded-full bg-chrono-primary shadow-sm shadow-chrono-primary/50" />
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-0">
                  <p className="text-xs font-medium leading-snug text-chrono-text">
                    {event.title}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Icon className="h-3 w-3" style={{ color }} />
                    <span className="text-[10px] text-chrono-text-dim">
                      {event.reference}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
