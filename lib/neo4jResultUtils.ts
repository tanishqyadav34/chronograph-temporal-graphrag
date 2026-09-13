/**
 * neo4jResultUtils.ts
 *
 * Pure helpers for normalizing raw Neo4j driver results into plain JSON-ish
 * objects and rendering them for the narrative LLM. Extracted from
 * app/api/chat/route.ts so the logic is unit-testable without Next.js.
 */

// ── Type guards ─────────────────────────────────────────────────────────────

export function isIntegerLike(v: unknown): v is { toNumber(): number } {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { toNumber?: unknown }).toNumber === "function"
  );
}

export function isNodeLike(
  v: unknown
): v is { labels: string[]; properties: Record<string, unknown> } {
  return (
    typeof v === "object" &&
    v !== null &&
    Array.isArray((v as { labels?: unknown }).labels) &&
    typeof (v as { properties?: unknown }).properties === "object" &&
    (v as { properties?: unknown }).properties !== null
  );
}

export function isRelLike(
  v: unknown
): v is { type: string; properties: Record<string, unknown> } {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { type?: unknown }).type === "string" &&
    typeof (v as { properties?: unknown }).properties === "object" &&
    (v as { properties?: unknown }).properties !== null
  );
}

// ── Normalization ───────────────────────────────────────────────────────────

/**
 * Convert driver values (Node / Relationship / Integer / arrays) into plain,
 * log-and-LLM friendly JSON-ish objects.
 *  - Node         → { __label, ...properties }
 *  - Relationship → { __relType, ...properties }
 *  - Integer      → number
 */
export function normalizeValue(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(normalizeValue);
  if (isIntegerLike(v)) return v.toNumber();
  if (isNodeLike(v)) {
    const props: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v.properties)) props[k] = normalizeValue(val);
    return { __label: v.labels[0] ?? "Node", ...props };
  }
  if (isRelLike(v)) {
    const props: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v.properties)) props[k] = normalizeValue(val);
    return { __relType: v.type, ...props };
  }
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = normalizeValue(val);
    return out;
  }
  return v;
}

// ── Rendering ───────────────────────────────────────────────────────────────

/** Compact human-readable rendering of a normalized value. */
export function describeValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return v.length > 80 ? `${v.slice(0, 80)}…` : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.map(describeValue).join(", ")}]`;
  if (typeof v === "object") {
    const ent = v as Record<string, unknown>;
    if (typeof ent.__relType === "string") {
      const props = Object.entries(ent).filter(
        ([k]) => !k.startsWith("__") && k !== "timestamp" && k !== "source_id" && k !== "sourceId"
      );
      const propStr = props.length
        ? ` {${props.map(([k, val]) => `${k}: ${describeValue(val)}`).join(", ")}}`
        : "";
      return `${ent.__relType}${propStr}`;
    }
    if (typeof ent.__label === "string") {
      const name = ent.name ?? ent.title ?? ent.id;
      const rest = Object.entries(ent).filter(
        ([k]) =>
          !k.startsWith("__") &&
          k !== "name" &&
          k !== "title" &&
          k !== "id" &&
          k !== "timestamp" &&
          k !== "source_id" &&
          k !== "sourceId"
      );
      const restStr = rest.length
        ? ` ${rest.map(([k, val]) => `${k}=${describeValue(val)}`).join(", ")}`
        : "";
      return `${ent.__label}(${describeValue(name ?? "?")})${restStr}`;
    }
    return JSON.stringify(v);
  }
  return String(v);
}

/**
 * Recursively find source_id / timestamp anywhere in a record (relationship
 * properties at any nesting depth) and report each (source_id, timestamp) pair.
 */
export function scanRefs(v: unknown, cb: (sourceId: string, timestamp?: string) => void): void {
  if (Array.isArray(v)) {
    v.forEach((x) => scanRefs(x, cb));
    return;
  }
  if (typeof v === "object" && v !== null) {
    const ent = v as Record<string, unknown>;
    const sid = ent.source_id ?? ent.sourceId;
    if (typeof sid === "string") {
      const ts = typeof ent.timestamp === "string" ? ent.timestamp : undefined;
      cb(sid, ts);
    }
    for (const val of Object.values(ent)) {
      if (val && typeof val === "object") scanRefs(val, cb);
    }
  }
}
