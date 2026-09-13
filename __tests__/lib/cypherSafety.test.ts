/**
 * Tests for lib/cypherSafety.ts — the read-only gate for LLM-generated Cypher.
 */
import {
  isSafeReadOnlyCypher,
  validateCypherStructure,
  ALLOWED_RELATIONSHIP_TYPES,
  ALLOWED_NODE_LABELS,
} from "@/lib/cypherSafety";

describe("isSafeReadOnlyCypher", () => {
  it("accepts valid read-only queries", () => {
    const valid = [
      `MATCH (p:Person)-[r:COMMITTED_CODE]->(t:Technology) RETURN p.name, t.name LIMIT 10`,
      `MATCH (n) RETURN count(n)`,
      `MATCH (p:Person) WHERE p.name STARTS WITH 'A' RETURN p.name ORDER BY p.name ASC`,
      `MATCH (p:Person)-[r:RESOLVED]->(t:Ticket)
       WITH p, count(r) AS resolved
       RETURN p.name, resolved ORDER BY resolved DESC LIMIT 5`,
    ];
    for (const q of valid) expect(isSafeReadOnlyCypher(q)).toBe(true);
  });

  it.each([
    "CREATE (n:Person {name: 'X'})",
    "MATCH (n) DETACH DELETE n",
    "MATCH (n) DELETE n",
    "MERGE (n:Person {name: 'X'})",
    "MATCH (n {name: 'x'}) SET n.name = 'y'",
    "MATCH (n {name: 'x'}) REMOVE n.name",
    "DROP INDEX ON :Person(name)",
  ])("rejects mutation query: %s", (q) => {
    expect(isSafeReadOnlyCypher(q)).toBe(false);
  });

  it("rejects empty and whitespace-only queries", () => {
    expect(isSafeReadOnlyCypher("")).toBe(false);
    expect(isSafeReadOnlyCypher("   ")).toBe(false);
  });

  it("matches keywords as whole words (no false positives)", () => {
    // 'offset'/'dataset'/'reset' contain keyword substrings but are not mutations.
    expect(isSafeReadOnlyCypher(`MATCH (n) RETURN n SKIP 10 LIMIT 5 OFFSET 0`)).toBe(true);
    expect(isSafeReadOnlyCypher(`MATCH (d:Dataset) RETURN d.name`)).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isSafeReadOnlyCypher("match (n) create (m) return m")).toBe(false);
    expect(isSafeReadOnlyCypher("MATCH (n) RETURN n")).toBe(true);
  });

  it("rejects mutations hidden in string literals too (conservative)", () => {
    // The safety layer is deliberately keyword-based; a literal containing a
    // mutation keyword is treated as unsafe. Documented behavior.
    expect(isSafeReadOnlyCypher(`RETURN 'please CREATE this'`)).toBe(false);
  });
});

describe("validateCypherStructure", () => {
  it("accepts a fully valid query", () => {
    const q = `MATCH (p:Person)-[r:ARGUED_AGAINST]->(t:Technology {name: 'GCP'})
               RETURN p.name AS person, r.timestamp AS timestamp
               ORDER BY r.timestamp ASC`;
    const res = validateCypherStructure(q);
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it.each([...ALLOWED_RELATIONSHIP_TYPES])("accepts allowed relationship type %s", (rel) => {
    const q = `MATCH (p:Person)-[r:${rel}]->(n) RETURN r.timestamp`;
    expect(validateCypherStructure(q).ok).toBe(true);
  });

  it("rejects unknown relationship types", () => {
    const res = validateCypherStructure(`MATCH (p:Person)-[r:LOVES]->(n:Person) RETURN r`);
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/undefined relationship type LOVES/);
  });

  it("rejects unknown node labels", () => {
    const res = validateCypherStructure(`MATCH (p:Person)-[r:MENTIONED]->(c:Company) RETURN c`);
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/undefined node label Company/);
  });

  it("rejects unbound variables in RETURN", () => {
    const res = validateCypherStructure(`MATCH (p:Person) RETURN p.name, ghost.name`);
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/ghost/);
  });

  it("rejects unbound variables in WHERE", () => {
    const res = validateCypherStructure(`MATCH (p:Person) WHERE phantom.name = 'x' RETURN p`);
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/phantom/);
  });

  it("ignores relationship types inside string literals", () => {
    const q = `MATCH (p:Person {name: 'ADVOCATED_FOR fan'}) RETURN p.name`;
    expect(validateCypherStructure(q).ok).toBe(true);
  });

  it("accepts variable-length relationship suffixes", () => {
    const q = `MATCH (p:Person)-[r:MENTIONED*1..2]->(n:Technology) RETURN p.name, n.name`;
    expect(validateCypherStructure(q).ok).toBe(true);
  });
});
