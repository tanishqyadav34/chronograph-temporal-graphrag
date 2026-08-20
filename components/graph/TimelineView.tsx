"use client";

import { Slack, Github, Ticket } from "lucide-react";
import { useHighlight } from "@/lib/highlight-context";
import { useGraphData } from "@/lib/graph-data-context";

const refIcons: Record<string, React.ElementType> = {
  slack: Slack,
  github: Github,
  jira: Ticket,
};

const refColors: Record<string, string> = {
  slack: "#e01e5a",
  github: "#8b949e",
  jira: "#2684ff",
};

export default function TimelineView() {
  const { highlight, setHighlight } = useHighlight();
  const { timelineEvents } = useGraphData();

  return (
    <div className="h-full overflow-y-auto scrollbar-thin px-4 py-4">
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[68px] top-2 h-[calc(100%-16px)] w-px bg-gradient-to-b from-chrono-primary/40 via-chrono-violet/20 to-transparent" />

        <div className="space-y-0">
          {timelineEvents.length === 0 && (
            <p className="px-4 py-6 text-xs text-chrono-text-dim">
              No timeline events found in this dataset.
            </p>
          )}
          {timelineEvents.map((event) => {
            const Icon = refIcons[event.referenceType];
            const color = refColors[event.referenceType];
            const isHighlighted =
              highlight.sourceId !== null && event.sourceId === highlight.sourceId;

            return (
              <div key={event.id} className="relative flex gap-4 pb-4 last:pb-0">
                {/* Date */}
                <div className="relative z-10 flex w-16 flex-shrink-0 items-start justify-end pt-3">
                  <span className="text-[11px] font-medium text-chrono-text-dim">
                    {event.date}
                  </span>
                </div>

                {/* Dot */}
                <div className="relative z-10 flex-shrink-0 pt-3">
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 bg-chrono-surface shadow-sm transition-all duration-150 ${
                      isHighlighted
                        ? "border-chrono-primary bg-chrono-primary/20 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                        : "border-chrono-primary/30"
                    }`}
                  >
                    <div
                      className={`h-2 w-2 rounded-full transition-all ${
                        isHighlighted
                          ? "bg-chrono-primary"
                          : "bg-chrono-primary/70"
                      }`}
                    />
                  </div>
                </div>

                {/* Event card */}
                <div
                  onMouseEnter={() => setHighlight(event.sourceId)}
                  onMouseLeave={() => setHighlight(null)}
                  className={`mb-0 flex-1 min-w-0 rounded-md p-3 transition-all duration-150 ${
                    isHighlighted
                      ? "bg-chrono-primary/10 ring-1 ring-chrono-primary/60"
                      : "bg-chrono-surface-light hover:bg-chrono-surface"
                  }`}
                >
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
