"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Expand, Maximize2, Minus, Plus, Crosshair } from "lucide-react";
import { mockGraphData } from "@/lib/mockGraph";

const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d").then((mod) => mod.default),
  { ssr: false }
);

export default function GraphView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 400 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const handleReset = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 0.8);
    }
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {/* Toolbar */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-chrono-border bg-chrono-surface/90 px-1.5 py-1 backdrop-blur-md">
        <button
          onClick={handleReset}
          className="rounded-md p-1 text-chrono-text-muted transition-colors hover:bg-chrono-surface-light hover:text-chrono-text"
          title="Reset view"
        >
          <Crosshair className="h-3.5 w-3.5" />
        </button>
        <button
          className="rounded-md p-1 text-chrono-text-muted transition-colors hover:bg-chrono-surface-light hover:text-chrono-text"
          title="Focus"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button
          className="rounded-md p-1 text-chrono-text-muted transition-colors hover:bg-chrono-surface-light hover:text-chrono-text"
          title="Fullscreen"
        >
          <Expand className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Graph Canvas */}
      <div className="h-full w-full rounded-lg bg-gradient-to-br from-chrono-bg via-[#0d1117] to-chrono-bg-secondary">
        {mounted && (
          <ForceGraph2D
            ref={graphRef}
            graphData={mockGraphData}
            nodeLabel={(node: any) => node.label}
            nodeColor={(node: any) => node.color || "#6366f1"}
            nodeVal={(node: any) => {
              const sizes: Record<string, number> = {
                system: 12,
                person: 10,
                incident: 14,
                evidence: 8,
              };
              return sizes[node.type] || 10;
            }}
            linkColor={() => "rgba(99, 102, 241, 0.3)"}
            linkDirectionalParticles={1}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleColor={() => "#6366f1"}
            linkLabel={(link: any) => link.label}
            backgroundColor="transparent"
            width={dimensions.width}
            height={dimensions.height}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
            onEngineStop={() => {
              if (graphRef.current) {
                graphRef.current.zoomToFit(400, 0.8);
              }
            }}
          />
        )}
      </div>

      {/* Zoom Controls */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1 rounded-lg border border-chrono-border bg-chrono-surface/90 p-1 backdrop-blur-md">
        <button
          onClick={handleZoomIn}
          className="rounded-md p-1.5 text-chrono-text-muted transition-colors hover:bg-chrono-surface-light hover:text-chrono-text"
          title="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <div className="h-px bg-chrono-border" />
        <button
          onClick={handleZoomOut}
          className="rounded-md p-1.5 text-chrono-text-muted transition-colors hover:bg-chrono-surface-light hover:text-chrono-text"
          title="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
