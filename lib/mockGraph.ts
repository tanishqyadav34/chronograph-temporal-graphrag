/**
 * mockGraph.ts
 *
 * Loads the default knowledge-graph dataset from data/mockGraph.json and
 * type-checks it against the shapes the UI consumes (ParsedNode, ParsedLink,
 * ParsedEvent). The raw data lives in JSON so this module stays small and the
 * dataset stays diffable.
 */
import raw from "@/data/mockGraph.json";

export interface MockNode {
  id: string;
  label: string;
  type: string;
  color?: string;
  detail?: string;
}

export interface MockLink {
  source: string;
  target: string;
  label: string;
  sourceId: string;
}

export interface MockTimelineEvent {
  id: string;
  date: string;
  title: string;
  reference: string;
  referenceType: string;
  sourceId: string;
}

export interface MockGraph {
  nodes: MockNode[];
  links: MockLink[];
}

interface RawFile {
  graph: MockGraph;
  timeline: MockTimelineEvent[];
}

const data = raw as RawFile;

/** Default graph dataset (nodes + links), derived from data/mock_dataset.json. */
export const mockGraphData: MockGraph = data.graph;

/** Default timeline events, derived from extraction/extracted_triples.json. */
export const mockTimelineEvents: MockTimelineEvent[] = data.timeline;
