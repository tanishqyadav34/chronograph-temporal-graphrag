"use client";

import { useState } from "react";
import { X, Network, Clock } from "lucide-react";
import GraphView from "./GraphView";
import TimelineView from "./TimelineView";

interface GraphPanelProps {
  onClose?: () => void;
}

export default function GraphPanel({ onClose }: GraphPanelProps) {
  const [activeTab, setActiveTab] = useState<"graph" | "timeline">("graph");

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-chrono-border px-4">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab("graph")}
            className={`flex items-center gap-1.5 border-b-2 pb-2 pt-3 text-xs font-medium transition-colors ${
              activeTab === "graph"
                ? "border-chrono-primary text-chrono-text"
                : "border-transparent text-chrono-text-muted hover:text-chrono-text"
            }`}
          >
            <Network className="h-3.5 w-3.5" />
            Knowledge Graph
          </button>
          <button
            onClick={() => setActiveTab("timeline")}
            className={`flex items-center gap-1.5 border-b-2 pb-2 pt-3 text-xs font-medium transition-colors ${
              activeTab === "timeline"
                ? "border-chrono-primary text-chrono-text"
                : "border-transparent text-chrono-text-muted hover:text-chrono-text"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Timeline
          </button>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-md p-1 text-chrono-text-muted transition-colors hover:bg-chrono-surface-light hover:text-chrono-text"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "graph" ? <GraphView /> : <TimelineView />}
      </div>
    </div>
  );
}
