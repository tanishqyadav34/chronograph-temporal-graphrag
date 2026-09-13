/**
 * graphResults.ts
 *
 * Turns raw Neo4j result rows (plain records) into the narrative LLM context:
 * chronological sorting, even sampling, readable line rendering, and
 * Source-card construction. Extracted from app/api/chat/route.ts.
 */
import { describeValue, normalizeValue, scanRefs } from "./neo4jResultUtils";
import { DatasetRecord, PlainRecord, toPlatform } from "./datasetRecords";

// Cap on result rows sent to the narrative LLM per request (context-window safety).
export const MAX_CONTEXT_RECORDS = 40;
// Cap on source cards returned to the UI.
export const MAX_SOURCES = 12;

/** Render one Neo4j record as a readable context line. */
function recordToLine(rec: PlainRecord): { line: string; date: string | null; sourceId: string | null } {
  const parts: string[] = [];
  let date: string | null = null;
  let sourceId: string | null = null;

  for (const [key, raw] of Object.entries(rec)) {
    scanRefs(raw, (sid, ts) => {
      if (!sourceId && sid) sourceId = sid;
      if (!date && ts) date = ts.slice(0, 10);
    });
    parts.push(`${key}: ${describeValue(normalizeValue(raw))}`);
  }
  return { line: parts.join(" | "), date, sourceId };
}

/**
 * Build the LLM context from raw Neo4j records.
 * Returns the readable context string plus a Map of every unique source_id
 * found in the results → its timestamp (for the SourceCards).
 */
export function buildContextFromRecords(
  records: PlainRecord[]
): { context: string; refs: Map<string, string> } {
  const refs = new Map<string, string>();
  const lines: string[] = [];

  for (const rec of records.slice(0, MAX_CONTEXT_RECORDS)) {
    scanRefs(rec, (sid, ts) => {
      if (!refs.has(sid)) refs.set(sid, ts ?? "");
    });
    const { line, date, sourceId } = recordToLine(rec);
    lines.push(`- [${date ?? "unknown-date"}] ${line}${sourceId ? ` (source: ${sourceId})` : ""}`);
  }

  return {
    context: lines.length ? lines.join("\n") : "(no rows returned)",
    refs,
  };
}

/** Earliest ISO timestamp found anywhere in a record (for chronological merge). */
function recordTimestamp(rec: PlainRecord): string | null {
  let best: string | null = null;
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (typeof v === "object" && v !== null) {
      const ent = v as Record<string, unknown>;
      const ts = typeof ent.timestamp === "string" ? ent.timestamp : null;
      if (ts !== null && (best === null || ts < best)) best = ts;
      Object.values(ent).forEach((val) => {
        if (val && typeof val === "object") walk(val);
      });
    }
  };
  walk(rec);
  return best;
}

/** Sort records oldest→newest by their relationship timestamp (unknowns last). */
export function sortByTimestamp(rows: PlainRecord[]): PlainRecord[] {
  return rows
    .map((r) => ({ r, ts: recordTimestamp(r) }))
    .sort((a, b) => {
      if (a.ts === null && b.ts === null) return 0;
      if (a.ts === null) return 1;
      if (b.ts === null) return -1;
      return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0;
    })
    .map((x) => x.r);
}

/** If too many rows for the narrative context window, sample evenly across time. */
export function sampleEvenly<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const out: T[] = [];
  const step = rows.length / max;
  for (let i = 0; i < max; i++) {
    out.push(rows[Math.min(rows.length - 1, Math.floor(i * step))]);
  }
  return out;
}

/** Build the frontend Source[] array from graph refs + dataset metadata. */
export function buildSources(
  refs: Map<string, string>,
  recordMap: Map<string, DatasetRecord>,
  modelIds: string[]
): Array<{
  id: string;
  title: string;
  excerpt: string;
  timestamp: string;
  platform: "slack" | "github" | "jira";
  metadata: string;
}> {
  // Ground sources strictly in the query results: only ids actually found in
  // the Neo4j relationship properties pass. recordMap enriches them (title /
  // excerpt / platform) but never widens the set.
  const uniqueSourceIds = Array.from(refs.keys());
  const cited = modelIds.filter((id) => refs.has(id));
  // Prefer the model's cited ids (in its order), then append the rest from the
  // graph so no real evidence is dropped.
  const finalIds = cited.length
    ? Array.from(new Set([...cited, ...uniqueSourceIds]))
    : uniqueSourceIds;

  return finalIds.slice(0, MAX_SOURCES).map((id) => {
    const rec = recordMap.get(id);
    return {
      id,
      title: rec
        ? rec.source_type === "jira"
          ? rec.content.split(":")[0].trim()
          : rec.content.slice(0, 60)
        : id,
      excerpt: rec ? rec.content : "Knowledge graph evidence",
      timestamp: refs.get(id) || rec?.timestamp || new Date().toISOString(),
      platform: rec ? toPlatform(rec.source_type) : "jira",
      metadata: rec ? `${rec.source_type} · ${rec.author}` : "Knowledge graph",
    };
  });
}
