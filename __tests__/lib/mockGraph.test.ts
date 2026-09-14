/**
 * Tests for lib/mockGraph.ts — the loaded dataset must match the
 * ParsedDataset shape used across the UI (nodes/links/timeline).
 */
import { mockGraphData, mockTimelineEvents } from "@/lib/mockGraph";
import type { ParsedDataset } from "@/lib/parseDataset";

describe("mockGraph dataset", () => {
  it("loads a non-empty graph with nodes and links", () => {
    expect(mockGraphData.nodes.length).toBeGreaterThan(0);
    expect(mockGraphData.links.length).toBeGreaterThan(0);
  });

  it("conforms to the ParsedDataset node/link/event shapes", () => {
    const dataset = {
      nodes: mockGraphData.nodes,
      links: mockGraphData.links,
      timeline: mockTimelineEvents,
    } as unknown as ParsedDataset;

    for (const node of dataset.nodes) {
      expect(typeof node.id).toBe("string");
      expect(typeof node.label).toBe("string");
      expect(["person", "technology", "ticket"]).toContain(node.type);
    }

    for (const link of dataset.links) {
      expect(typeof link.source).toBe("string");
      expect(typeof link.target).toBe("string");
      expect(typeof link.label).toBe("string");
      expect(typeof link.sourceId).toBe("string");
    }

    for (const event of dataset.timeline) {
      expect(typeof event.id).toBe("string");
      expect(typeof event.date).toBe("string");
      expect(typeof event.title).toBe("string");
      expect(["slack", "github", "jira"]).toContain(event.referenceType);
      expect(typeof event.sourceId).toBe("string");
    }
  });

  it("has every link endpoint present as a node id", () => {
    const ids = new Set(mockGraphData.nodes.map((n) => n.id));
    for (const link of mockGraphData.links) {
      expect(ids.has(link.source)).toBe(true);
      expect(ids.has(link.target)).toBe(true);
    }
  });

  it("has unique node ids", () => {
    const ids = mockGraphData.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique timeline event ids", () => {
    const ids = mockTimelineEvents.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
