/**
 * Tests for lib/datasetRecords.ts — record-map loading and platform mapping.
 */
jest.mock("fs", () => {
  const actual = jest.requireActual("fs");
  return {
    ...actual,
    readFileSync: jest.fn((p: unknown) => {
      if (String(p).includes("mock_dataset.json")) {
        return JSON.stringify([
          { source_id: "rec_001", source_type: "git", author: "Dave", content: "committed", timestamp: "2024-01-01T10:00:00Z" },
          { source_id: "rec_002", source_type: "slack", author: "Alice", content: "hello", timestamp: "2024-01-02T10:00:00Z" },
        ]);
      }
      return actual.readFileSync(p as never);
    }),
  };
});

import { loadRecordMap, toPlatform, type DatasetRecord } from "@/lib/datasetRecords";

describe("loadRecordMap", () => {
  it("indexes the dataset by source_id", () => {
    const map = loadRecordMap();
    expect(map.get("rec_001")).toMatchObject({ source_type: "git", author: "Dave" });
    expect(map.get("rec_002")).toMatchObject({ source_type: "slack" });
    expect(map.has("rec_999")).toBe(false);
  });
});

describe("toPlatform", () => {
  it("maps git to github and passes through the rest", () => {
    expect(toPlatform("git")).toBe("github");
    expect(toPlatform("slack")).toBe("slack");
    expect(toPlatform("jira")).toBe("jira");
  });

  it("accepts every DatasetRecord source_type", () => {
    const types: Array<DatasetRecord["source_type"]> = ["slack", "git", "jira"];
    for (const t of types) expect(typeof toPlatform(t)).toBe("string");
  });
});
