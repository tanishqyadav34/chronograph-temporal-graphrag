"use client";

import { useState } from "react";
import { X, Network, Clock, Database, Paperclip, Download } from "lucide-react";
import GraphView from "./GraphView";
import TimelineView from "./TimelineView";
import { useGraphData } from "@/lib/graph-data-context";

interface GraphPanelProps {
  onClose?: () => void;
}

export default function GraphPanel({ onClose }: GraphPanelProps) {
  const [activeTab, setActiveTab] = useState<"graph" | "timeline">("graph");
  const [exported, setExported] = useState(false);
  const { graphData, timelineEvents, sourceName, attachmentLabel } = useGraphData();

  // Download the currently displayed graph (adapted-from-file or default
  // knowledge graph) as reusable JSON — nodes, links and the timeline.
  const handleExport = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      source: sourceName ?? "knowledge-graph",
      nodes: graphData.nodes,
      links: graphData.links,
      timeline: timelineEvents,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const base = (
      (sourceName ?? "knowledge-graph").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "graph"
    ).slice(0, 50);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chronograph-${base}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Defer revocation so in-flight downloads aren't cancelled in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExported(true);
    setTimeout(() => setExported(false), 1600);
  };

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

      {/* Dataset indicator + export */}
      <div className="flex items-center gap-1.5 border-b border-chrono-border bg-chrono-primary/5 px-4 py-1.5">
        {sourceName ? (
          <>
            <Paperclip className="h-3 w-3 flex-shrink-0 text-chrono-cyan" />
            <span className="min-w-0 flex-1 truncate text-[10px] text-chrono-text-muted">
              Adapted from{" "}
              <span className="font-semibold text-chrono-text">{sourceName}</span>
            </span>
          </>
        ) : attachmentLabel ? (
          <>
            <Paperclip className="h-3 w-3 flex-shrink-0 text-chrono-text-dim" />
            <span className="min-w-0 flex-1 truncate text-[10px] text-chrono-text-muted">
              Attached: <span className="font-semibold text-chrono-text">{attachmentLabel}</span>{" "}
              — not parsed into a graph (PDF or unrecognized format)
            </span>
          </>
        ) : (
          <>
            <Database className="h-3 w-3 flex-shrink-0 text-chrono-text-dim" />
            <span className="flex-1 text-[10px] text-chrono-text-muted">
              Knowledge graph · Neo4j
            </span>
          </>
        )}
        <button
          onClick={handleExport}
          title={
            sourceName
              ? "Download the current adapted graph as JSON (nodes, links, timeline)"
              : attachmentLabel
              ? "This file wasn't parsed into a graph — exporting the currently displayed knowledge graph"
              : "Download the current knowledge graph as JSON (nodes, links, timeline)"
          }
          className="flex flex-shrink-0 items-center gap-1 rounded-md border border-chrono-border bg-chrono-surface-light px-2 py-1 text-[10px] font-medium text-chrono-text-muted transition-all duration-150 hover:border-chrono-primary/40 hover:text-chrono-text active:scale-95"
          aria-label="Export graph as JSON"
        >
          <Download className="h-3 w-3" />
          {exported ? "Exported ✓" : "Export JSON"}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "graph" ? <GraphView /> : <TimelineView />}
      </div>
    </div>
  );
}
