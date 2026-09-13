/**
 * Tests for lib/graphResults.ts — context building, sorting, sampling, sources.
 */
import {
  buildContextFromRecords,
  sortByTimestamp,
  sampleEvenly,
  buildSources,
} from "@/lib/graphResults";
import { DatasetRecord } from "@/lib/datasetRecords";

describe("sortByTimestamp", () => {
  it("sorts rows oldest → newest by nested relationship timestamp", () => {
    const rows = [
      { edge: { source_id: "b", timestamp: "2023-03-01T00:00:00Z" } },
      { edge: { source_id: "a", timestamp: "2023-01-01T00:00:00Z" } },
      { edge: { source_id: "c", timestamp: "2023-02-01T00:00:00Z" } },
    ];
    const sorted = sortByTimestamp(rows);
    expect(sorted.map((r) => (r.edge as any).source_id)).toEqual(["a", "c", "b"]);
  });

  it("puts rows without timestamps last, preserving stable order otherwise", () => {
    const rows = [
      { edge: { source_id: "no-ts" } },
      { edge: { source_id: "ts", timestamp: "2023-01-01T00:00:00Z" } },
    ];
    const sorted = sortByTimestamp(rows);
    expect(sorted.map((r) => (r.edge as any).source_id)).toEqual(["ts", "no-ts"]);
  });
});

describe("sampleEvenly", () => {
  it("returns the input when under the cap", () => {
    const rows = [1, 2, 3];
    expect(sampleEvenly(rows, 5)).toEqual([1, 2, 3]);
  });

  it("samples evenly across the timeline when over the cap", () => {
    const rows = Array.from({ length: 10 }, (_, i) => i);
    const out = sampleEvenly(rows, 4);
    expect(out).toHaveLength(4);
    // Deterministic floor(i * 10/4) indices: 0, 2, 5, 7.
    expect(out).toEqual([0, 2, 5, 7]);
  });
});

describe("buildContextFromRecords", () => {
  it("renders readable lines with date + source annotations", () => {
    const rows = [
      { edge: { source_id: "rec_001", timestamp: "2023-01-15T08:00:00Z", person: "Alice" } },
    ];
    const { context, refs } = buildContextFromRecords(rows);
    expect(context).toContain("[2023-01-15]");
    expect(context).toContain("(source: rec_001)");
    expect(refs.get("rec_001")).toBe("2023-01-15T08:00:00Z");
  });

  it("returns a placeholder when no rows", () => {
    const { context, refs } = buildContextFromRecords([]);
    expect(context).toBe("(no rows returned)");
    expect(refs.size).toBe(0);
  });
});

describe("buildSources", () => {
  const recordMap = new Map<string, DatasetRecord>([
    [
      "rec_001",
      {
        source_id: "rec_001",
        source_type: "git",
        author: "Alice",
        content: "feat: migrate database to GCP",
        timestamp: "2023-01-15T08:00:00Z",
      },
    ],
    [
      "rec_002",
      {
        source_id: "rec_002",
        source_type: "jira",
        author: "Bob",
        content: "CHRONO-102: Assess risk | Status: Done",
        timestamp: "2023-01-16T08:00:00Z",
      },
    ],
  ]);

  it("builds source cards grounded in graph refs only", () => {
    const refs = new Map([["rec_001", "2023-01-15T08:00:00Z"]]);
    const sources = buildSources(refs, recordMap, []);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      id: "rec_001",
      platform: "github", // git → github mapping
      title: "feat: migrate database to GCP",
    });
  });

  it("prefers model-cited ids in order, then appends remaining refs", () => {
    const refs = new Map([
      ["rec_001", "2023-01-15T08:00:00Z"],
      ["rec_002", "2023-01-16T08:00:00Z"],
    ]);
    const sources = buildSources(refs, recordMap, ["rec_002"]);
    expect(sources.map((s) => s.id)).toEqual(["rec_002", "rec_001"]);
  });

  it("falls back to graph metadata when the dataset has no record", () => {
    const refs = new Map([["rec_999", "2023-01-01T00:00:00Z"]]);
    const sources = buildSources(refs, recordMap, []);
    expect(sources[0].metadata).toBe("Knowledge graph");
    expect(sources[0].platform).toBe("jira");
  });

  it("uses jira title convention (content before colon)", () => {
    const refs = new Map([["rec_002", "2023-01-16T08:00:00Z"]]);
    const sources = buildSources(refs, recordMap, []);
    expect(sources[0].title).toBe("CHRONO-102");
  });
});
