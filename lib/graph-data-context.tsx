"use client";

import { createContext, useContext, useMemo, ReactNode } from "react";
import { mockGraphData, mockTimelineEvents } from "@/lib/mockGraph";
import { parseDatasetText, ParsedDataset } from "@/lib/parseDataset";
import { useChat } from "@/lib/chat-context";

export interface GraphData {
  nodes: ParsedDataset["nodes"];
  links: ParsedDataset["links"];
}

interface GraphDataContextValue {
  graphData: GraphData;
  timelineEvents: ParsedDataset["timeline"];
  /** File name the graph was adapted from, or null when showing the default graph. */
  sourceName: string | null;
  /** Name of the active conversation's attached file (if any), parsed or not. */
  attachmentLabel: string | null;
}

const DEFAULT_TIMELINE = mockTimelineEvents as ParsedDataset["timeline"];

const GraphDataContext = createContext<GraphDataContextValue>({
  graphData: mockGraphData as unknown as GraphData,
  timelineEvents: DEFAULT_TIMELINE,
  sourceName: null,
  attachmentLabel: null,
});

export function GraphDataProvider({ children }: { children: ReactNode }) {
  const { activeConversation } = useChat();
  const attachment = activeConversation.attachment;

  // Rebuild the graph whenever the active conversation's attached file
  // changes. Text attachments are parsed heuristically into nodes/links/
  // timeline; anything unparseable (or no file at all) falls back to the
  // default knowledge graph. PDFs arrive as base64 and are not parsed here —
  // the panel badge then reports the file as attached-but-not-parsed.
  const value = useMemo<GraphDataContextValue>(() => {
    const attachmentLabel = attachment?.name ?? null;
    const content = attachment?.content;
    if (content && content.trim().length > 40) {
      try {
        const parsed = parseDatasetText(content);
        // Accept any parse that found at least two entities — even a
        // tech-only file with zero links still proves the panel adapted.
        if (parsed.nodes.length >= 2) {
          return {
            graphData: { nodes: parsed.nodes, links: parsed.links },
            timelineEvents: parsed.timeline,
            sourceName: attachment.name,
            attachmentLabel,
          };
        }
      } catch {
        // unparseable document — fall through to the default knowledge graph
      }
    }
    return {
      graphData: mockGraphData as unknown as GraphData,
      timelineEvents: DEFAULT_TIMELINE,
      sourceName: null,
      attachmentLabel,
    };
  }, [attachment]);

  return (
    <GraphDataContext.Provider value={value}>{children}</GraphDataContext.Provider>
  );
}

export function useGraphData(): GraphDataContextValue {
  return useContext(GraphDataContext);
}
