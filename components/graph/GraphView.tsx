"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import {
  Expand,
  Maximize2,
  Minus,
  Plus,
  Crosshair,
  SlidersHorizontal,
} from "lucide-react";
import { useGraphData } from "@/lib/graph-data-context";
import { useHighlight } from "@/lib/highlight-context";

// react-force-graph-2d touches `window` at module scope, so it must be
// loaded lazily on the client. next/dynamic does NOT forward refs, so we
// load it manually in a useEffect and store the component in state — this
// keeps SSR safe AND gives graphRef the imperative zoom/zoomToFit API.

const NODE_SIZES: Record<string, number> = {
  person: 9,
  technology: 7,
  ticket: 12,
};

const NODE_COLORS: Record<string, string> = {
  person: "#0d9488",
  technology: "#6366f1",
  ticket: "#818cf8",
};

type NodeType = "person" | "technology" | "ticket";
const TYPE_LABELS: Record<NodeType, string> = {
  person: "People",
  technology: "Technologies",
  ticket: "Tickets",
};

/** force-graph mutates link.source/target from id strings into node refs; handle both. */
function linkEndpoints(link: any): { src: string | null; tgt: string | null } {
  const src = link && link.source ? (typeof link.source === "object" ? link.source.id : link.source) : null;
  const tgt = link && link.target ? (typeof link.target === "object" ? link.target.id : link.target) : null;
  return { src, tgt };
}

export default function GraphView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 400 });
  const [ForceGraph, setForceGraph] = useState<React.ComponentType<any> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [visibleTypes, setVisibleTypes] = useState<Record<NodeType, boolean>>({
    person: true,
    technology: true,
    ticket: true,
  });
  const didInitialFit = useRef(false);
  const { graphData } = useGraphData();
  const { highlight } = useHighlight();
  const citationSourceId = highlight.sourceId;
  // A "file:*" citation means the whole graph was adapted from that file.
  const isFileCitation =
    typeof citationSourceId === "string" && citationSourceId.startsWith("file:");

  // Client-only lazy load of the force-graph component (ref-forwarding).
  useEffect(() => {
    let cancelled = false;
    import("react-force-graph-2d")
      .then((mod) => {
        if (!cancelled) setForceGraph(() => mod.default);
      })
      .catch(() => {
        // module load failed — leave graph empty rather than crashing
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // When the graph data changes (a file was attached / removed / replaced),
  // clear the stale selection and re-fit the new layout.
  const lastDataRef = useRef(graphData);
  useEffect(() => {
    if (lastDataRef.current !== graphData) {
      lastDataRef.current = graphData;
      didInitialFit.current = false;
      setSelectedId(null);
    }
  }, [graphData]);

  // Adjacency map (nodeId → connected nodeIds) computed once so the color/val
  // callbacks are O(1) instead of scanning all links per node per frame.
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of graphData.links as any[]) {
      const { src, tgt } = linkEndpoints(link);
      if (!src || !tgt) continue;
      if (!map.has(src)) map.set(src, new Set());
      if (!map.has(tgt)) map.set(tgt, new Set());
      map.get(src)!.add(tgt);
      map.get(tgt)!.add(src);
    }
    return map;
  }, [graphData]);

  const isConnected = useCallback(
    (nodeId: string) => adjacency.get(selectedId ?? "")?.has(nodeId) ?? false,
    [adjacency, selectedId]
  );

  // Nodes/links implicated by a citation pill hover in the chat pane.
  const citationNodes = useMemo(() => {
    const set = new Set<string>();
    if (!citationSourceId) return set;
    // A file citation implicates the whole adapted graph.
    if (isFileCitation) {
      for (const node of graphData.nodes) set.add(node.id);
      return set;
    }
    for (const link of graphData.links as any[]) {
      if (link.sourceId === citationSourceId) {
        const { src, tgt } = linkEndpoints(link);
        if (src) set.add(src);
        if (tgt) set.add(tgt);
      }
    }
    return set;
  }, [citationSourceId, isFileCitation, graphData]);

  // Filtered graph data — only show enabled node types (and links between
  // them). Objects are cloned so react-force-graph's in-place mutation never
  // contaminates the shared mockGraphData across filter toggles / remounts.
  const filteredData = useMemo(() => {
    const nodes = graphData.nodes
      .filter((n: any) => visibleTypes[n.type as NodeType] !== false)
      .map((n: any) => ({ ...n }));
    const nodeIds = new Set(nodes.map((n: any) => n.id));
    const links = (graphData.links as any[])
      .filter((l) => {
        const { src, tgt } = linkEndpoints(l);
        return src !== null && tgt !== null && nodeIds.has(src) && nodeIds.has(tgt);
      })
      .map((l: any) => ({ ...l }));
    return { nodes, links };
  }, [visibleTypes, graphData]);

  // ResizeObserver to track container dimensions
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width: Math.round(width), height: Math.round(height) });
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleZoomIn = useCallback(() => {
    if (graphRef.current) {
      const current = graphRef.current.zoom();
      graphRef.current.zoom(current * 1.3, 400);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (graphRef.current) {
      const current = graphRef.current.zoom();
      graphRef.current.zoom(current / 1.3, 400);
    }
  }, []);

  const handleRecenter = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 0.9);
    }
  }, []);

  const handleReset = useCallback(() => {
    setSelectedId(null);
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 0.8);
    }
  }, []);

  const handleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const handleNodeClick = useCallback((node: any) => {
    setSelectedId((prev) => (prev === node.id ? null : (node.id as string)));
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedId(null);
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {/* Top toolbar */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-chrono-border bg-chrono-surface/90 px-1.5 py-1 backdrop-blur-md">
        <button
          onClick={handleReset}
          className="rounded-md p-1 text-chrono-text-muted transition-colors hover:bg-chrono-surface-light hover:text-chrono-text"
          title="Reset view & clear selection"
        >
          <Crosshair className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleRecenter}
          className="rounded-md p-1 text-chrono-text-muted transition-colors hover:bg-chrono-surface-light hover:text-chrono-text"
          title="Fit graph to view"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleFullscreen}
          className="rounded-md p-1 text-chrono-text-muted transition-colors hover:bg-chrono-surface-light hover:text-chrono-text"
          title="Toggle fullscreen"
        >
          <Expand className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Selection hint */}
      {selectedId && (
        <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-chrono-border bg-chrono-surface/90 px-2.5 py-1.5 backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-chrono-cyan" />
          <span className="text-[10px] font-medium text-chrono-text">
            Connected relationships highlighted
          </span>
          <button
            onClick={() => setSelectedId(null)}
            className="text-[10px] font-semibold text-chrono-cyan transition-colors hover:text-teal-300"
          >
            Clear
          </button>
        </div>
      )}

      {/* Citation-linked hint */}
      {!selectedId && citationSourceId && (
        <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-chrono-border bg-chrono-surface/90 px-2.5 py-1.5 backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-chrono-cyan" />
          <span className="text-[10px] font-medium text-chrono-text">
            Linked from chat citation · {citationSourceId}
          </span>
        </div>
      )}

      {/* Graph Canvas */}
      <div className="h-full w-full rounded-lg bg-gradient-to-br from-chrono-bg via-chrono-bg-secondary to-chrono-bg-secondary">
        {ForceGraph && (
          <ForceGraph
            ref={graphRef}
            graphData={filteredData}
            nodeLabel={(node: any) =>
              `${node.label}${node.detail ? `\n${node.detail}` : ""}`
            }
            nodeColor={(node: any) => {
              if (selectedId) {
                if (node.id === selectedId) return "#fbbf24";
                return isConnected(node.id)
                  ? node.color || NODE_COLORS[node.type] || "#6366f1"
                  : "rgba(148, 163, 184, 0.25)";
              }
              if (citationSourceId) {
                if (citationNodes.has(node.id))
                  return node.color || NODE_COLORS[node.type] || "#6366f1";
                return "rgba(148, 163, 184, 0.25)";
              }
              return node.color || NODE_COLORS[node.type] || "#6366f1";
            }}
            nodeVal={(node: any) => {
              const base = NODE_SIZES[node.type] || 8;
              if (selectedId) {
                if (node.id === selectedId) return base * 1.6;
                return isConnected(node.id) ? base * 1.2 : base * 0.7;
              }
              if (citationSourceId) {
                return citationNodes.has(node.id) ? base * 1.3 : base * 0.7;
              }
              return base;
            }}
            linkColor={(link: any) => {
              if (selectedId) {
                const { src, tgt } = linkEndpoints(link);
                return src === selectedId || tgt === selectedId
                  ? "#fbbf24"
                  : "rgba(148, 163, 184, 0.12)";
              }
              if (citationSourceId) {
                return isFileCitation || link.sourceId === citationSourceId
                  ? "#14b8a6"
                  : "rgba(148, 163, 184, 0.12)";
              }
              return "rgba(99, 102, 241, 0.3)";
            }}
            linkWidth={(link: any) => {
              if (selectedId) {
                const { src, tgt } = linkEndpoints(link);
                return src === selectedId || tgt === selectedId ? 2 : 0.5;
              }
              if (citationSourceId) {
                return isFileCitation || link.sourceId === citationSourceId ? 2 : 0.5;
              }
              return 1;
            }}
            linkDirectionalParticles={(link: any) => {
              if (selectedId) {
                const { src, tgt } = linkEndpoints(link);
                return src === selectedId || tgt === selectedId ? 2 : 0;
              }
              if (citationSourceId) {
                return isFileCitation || link.sourceId === citationSourceId ? 2 : 0;
              }
              return 1;
            }}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleColor={(link: any) => {
              if (selectedId) {
                const { src, tgt } = linkEndpoints(link);
                return src === selectedId || tgt === selectedId ? "#fbbf24" : "#6366f1";
              }
              if (citationSourceId) {
                return isFileCitation || link.sourceId === citationSourceId ? "#14b8a6" : "#6366f1";
              }
              return "#6366f1";
            }}
            linkLabel={(link: any) => link.label}
            backgroundColor="transparent"
            width={dimensions.width}
            height={dimensions.height}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
            onNodeClick={handleNodeClick}
            onBackgroundClick={handleBackgroundClick}
            onEngineStop={() => {
              // Fit to view once on load. Selection changes reheat the
              // simulation, which would otherwise yank the user's zoom.
              if (graphRef.current && !didInitialFit.current) {
                didInitialFit.current = true;
                graphRef.current.zoomToFit(400, 0.8);
              }
            }}
          />
        )}
      </div>

      {/* Mini-toolbar: Zoom In / Zoom Out / Recenter / Filter */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col items-stretch gap-1 rounded-lg border border-chrono-border bg-chrono-surface/90 p-1 backdrop-blur-md">
        <button
          onClick={handleZoomIn}
          className="rounded-md p-1.5 text-chrono-text-muted transition-colors hover:bg-chrono-surface-light hover:text-chrono-text"
          title="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleZoomOut}
          className="rounded-md p-1.5 text-chrono-text-muted transition-colors hover:bg-chrono-surface-light hover:text-chrono-text"
          title="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <div className="h-px bg-chrono-border" />
        <button
          onClick={handleRecenter}
          className="rounded-md p-1.5 text-chrono-text-muted transition-colors hover:bg-chrono-surface-light hover:text-chrono-text"
          title="Recenter"
        >
          <Crosshair className="h-3.5 w-3.5" />
        </button>
        <div className="h-px bg-chrono-border" />
        <button
          onClick={() => setFilterOpen((o) => !o)}
          className={`rounded-md p-1.5 transition-colors ${
            filterOpen
              ? "bg-chrono-primary/15 text-chrono-primary"
              : "text-chrono-text-muted hover:bg-chrono-surface-light hover:text-chrono-text"
          }`}
          title="Filter node types"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Filter popover */}
      {filterOpen && (
        <div className="absolute bottom-16 right-3 z-10 w-40 rounded-lg border border-chrono-border bg-chrono-surface p-2 shadow-xl">
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-chrono-text-dim">
            Node types
          </p>
          {(Object.keys(TYPE_LABELS) as NodeType[]).map((type) => (
            <label
              key={type}
              className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-xs text-chrono-text-muted transition-colors hover:bg-chrono-surface-light hover:text-chrono-text"
            >
              <input
                type="checkbox"
                checked={visibleTypes[type]}
                onChange={() =>
                  setVisibleTypes((prev) => ({ ...prev, [type]: !prev[type] }))
                }
                className="h-3.5 w-3.5 rounded border-chrono-border accent-indigo-500"
              />
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: NODE_COLORS[type] }} />
              {TYPE_LABELS[type]}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
