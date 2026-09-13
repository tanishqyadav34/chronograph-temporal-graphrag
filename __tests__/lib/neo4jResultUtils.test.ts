/**
 * Tests for lib/neo4jResultUtils.ts — driver value normalization and rendering.
 */
import {
  isIntegerLike,
  isNodeLike,
  isRelLike,
  normalizeValue,
  describeValue,
  scanRefs,
} from "@/lib/neo4jResultUtils";

/** Minimal stand-ins for neo4j-driver types (duck-typed, like the real guards). */
const intLike = (n: number) => ({ toNumber: () => n });
const nodeLike = (label: string, props: Record<string, unknown>) => ({
  labels: [label],
  properties: props,
});
const relLike = (type: string, props: Record<string, unknown>) => ({
  type,
  properties: props,
});

describe("type guards", () => {
  it("isIntegerLike accepts objects with toNumber", () => {
    expect(isIntegerLike(intLike(5))).toBe(true);
    expect(isIntegerLike({})).toBe(false);
    expect(isIntegerLike(5)).toBe(false);
    expect(isIntegerLike(null)).toBe(false);
  });

  it("isNodeLike accepts {labels, properties}", () => {
    expect(isNodeLike(nodeLike("Person", { name: "Alice" }))).toBe(true);
    expect(isNodeLike({ labels: "nope", properties: {} })).toBe(false);
    expect(isNodeLike({ labels: [], properties: null })).toBe(false);
  });

  it("isRelLike accepts {type, properties}", () => {
    expect(isRelLike(relLike("RESOLVED", { timestamp: "t" }))).toBe(true);
    expect(isRelLike({ type: 42, properties: {} })).toBe(false);
  });
});

describe("normalizeValue", () => {
  it("converts Integer-like values to numbers", () => {
    expect(normalizeValue(intLike(164))).toBe(164);
  });

  it("converts a Node to {__label, ...properties}", () => {
    const out = normalizeValue(nodeLike("Person", { name: "Alice" })) as Record<string, unknown>;
    expect(out.__label).toBe("Person");
    expect(out.name).toBe("Alice");
  });

  it("converts a Relationship to {__relType, ...properties}", () => {
    const out = normalizeValue(
      relLike("COMMITTED_CODE", { timestamp: "2023-02-01T00:00:00Z", source_id: "rec_001" })
    ) as Record<string, unknown>;
    expect(out.__relType).toBe("COMMITTED_CODE");
    expect(out.timestamp).toBe("2023-02-01T00:00:00Z");
    expect(out.source_id).toBe("rec_001");
  });

  it("normalizes nested structures recursively", () => {
    const out = normalizeValue({
      person: nodeLike("Person", { name: "Bob" }),
      edge: relLike("MENTIONED", { count: intLike(3) }),
      tags: [intLike(1), intLike(2)],
    }) as Record<string, any>;
    expect(out.person.__label).toBe("Person");
    expect(out.edge.__relType).toBe("MENTIONED");
    expect(out.edge.count).toBe(3);
    expect(out.tags).toEqual([1, 2]);
  });

  it("maps null/undefined to null and passes primitives through", () => {
    expect(normalizeValue(null)).toBeNull();
    expect(normalizeValue(undefined)).toBeNull();
    expect(normalizeValue("x")).toBe("x");
    expect(normalizeValue(7)).toBe(7);
    expect(normalizeValue(true)).toBe(true);
  });
});

describe("describeValue", () => {
  it("renders null-ish values", () => {
    expect(describeValue(null)).toBe("null");
    expect(describeValue(undefined)).toBe("null");
  });

  it("truncates long strings with ellipsis", () => {
    const long = "a".repeat(100);
    const out = describeValue(long);
    expect(out.startsWith("a".repeat(80))).toBe(true);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThan(100);
  });

  it("renders a node as Label(name)", () => {
    const node = normalizeValue(nodeLike("Person", { name: "Alice" }));
    expect(describeValue(node)).toMatch(/^Person\(Alice\)/);
  });

  it("renders a relationship as REL_TYPE {props}", () => {
    const rel = normalizeValue(relLike("ARGUED_AGAINST", { source_id: "rec_009" }));
    expect(describeValue(rel)).toMatch(/^ARGUED_AGAINST/);
    expect(describeValue(rel)).not.toContain("source_id"); // hidden meta props
  });

  it("renders arrays and primitives", () => {
    expect(describeValue([1, 2])).toBe("[1, 2]");
    expect(describeValue(42)).toBe("42");
    expect(describeValue(true)).toBe("true");
  });
});

describe("scanRefs", () => {
  it("finds source_id + timestamp in nested relationship properties", () => {
    const rec = {
      person: { __label: "Person", name: "Dave" },
      edge: { __relType: "RESOLVED", source_id: "rec_061", timestamp: "2023-05-01T10:00:00Z" },
    };
    const found: Array<[string, string | undefined]> = [];
    scanRefs(rec, (sid, ts) => found.push([sid, ts]));
    expect(found).toEqual([["rec_061", "2023-05-01T10:00:00Z"]]);
  });

  it("walks arrays and accepts sourceId camelCase", () => {
    const rec = [{ sourceId: "rec_002" }, { source_id: "rec_003" }];
    const ids: string[] = [];
    scanRefs(rec, (sid) => ids.push(sid));
    expect(ids).toEqual(["rec_002", "rec_003"]);
  });

  it("ignores records without source ids", () => {
    const calls: unknown[] = [];
    scanRefs({ a: { b: { c: 1 } } }, (...args) => calls.push(args));
    expect(calls).toHaveLength(0);
  });
});
