/**
 * textToCypher.ts
 *
 * Converts a natural-language question into read-only Cypher queries using
 * the Groq API (plain fetch — same endpoint/model as app/api/chat/route.ts;
 * deliberately avoids the `groq-sdk` package, which is not a project dependency).
 *
 * Entry points:
 *   - classifyQuestion()     — deterministic classifier: which pipeline to use.
 *   - generateCypher()       — a SINGLE Cypher query for SIMPLE questions.
 *   - generateSubQueries()   — 2–4 INDEPENDENT single-hop queries covering
 *                              DIFFERENT relationship types for SYNTHESIS
 *                              questions ("why / how / what happened").
 *   - groqChat()             — shared Groq call with 429 rate-limit backoff
 *                              (used by the route's narrative call too).
 */

import { ALLOWED_RELATIONSHIP_TYPES, ALLOWED_NODE_LABELS } from "./cypherSafety";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";

const REL_TYPES_STR = ALLOWED_RELATIONSHIP_TYPES.join(", ");
const NODE_LABELS_STR = ALLOWED_NODE_LABELS.join(", ");

// ── Shared Groq call (with 429 backoff) ─────────────────────────────────────

interface GroqResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

/** Pull the suggested wait time out of a Groq 429 body ("try again in 8.13s"). */
function extractRetrySeconds(body: string): number | null {
  const m = body.match(/try again in (\d+(?:\.\d+)?)s/i);
  if (m) {
    const s = parseFloat(m[1]);
    if (Number.isFinite(s) && s > 0) return Math.min(s, 15);
  }
  return null;
}

/**
 * POST a chat-completions payload to Groq with automatic backoff on 429
 * (rate-limit) responses — up to 3 attempts total. Throws on final failure.
 */
export async function groqChat(
  body: Record<string, unknown>,
  timeoutMs = 30_000
): Promise<GroqResponse> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) throw new Error("GROK_API_KEY is not configured. Add it to .env");

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.status === 429 && attempt < maxAttempts) {
      const bodyText = await res.text();
      const headerDelay = Number(res.headers.get("retry-after"));
      const delaySecs =
        Number.isFinite(headerDelay) && headerDelay > 0
          ? Math.min(headerDelay, 15)
          : (extractRetrySeconds(bodyText) ?? attempt * 3);
      const delayMs = delaySecs * 1000;
      console.log(
        `[chrono-cypher] Groq rate-limited (429) — backing off ${Math.round(delayMs / 1000)}s (attempt ${attempt}/${maxAttempts})`
      );
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 400);
      throw new Error(`Groq API error (${res.status}): ${detail}`);
    }
    return (await res.json()) as GroqResponse;
  }
  throw new Error("Groq rate limit exceeded after retries");
}

// ── Question classification ────────────────────────────────────────────────

/**
 * Keywords/phrases that signal a broad, time-spanning question. Kept as plain
 * substring checks (lowercased) so the classifier is deterministic and adds
 * zero latency — no extra LLM call per request.
 */
const SYNTHESIS_TRIGGERS = [
  "why",
  "how",
  "what happened",
  "what was",
  "what were",
  "timeline",
  "overview",
  "history",
  "progress",
  "explain",
  "summar",
  "sequence",
  "chronolog",
  "over time",
  "story",
  "reasons",
  "cause",
  "roadmap",
  "context",
  "events",
  "takeaways",
  "recap",
  "whole picture",
  "lead up",
];

/**
 * Lightweight question classifier.
 *
 *   - "simple"    → targets a single relationship type ("who argued against
 *                   X", "what did Dave work on") → single-query pipeline.
 *   - "synthesis" → broad "why / how / what happened / timeline" questions
 *                   spanning multiple relationship types and a time range →
 *                   multi-query pipeline.
 */
export function classifyQuestion(question: string): "simple" | "synthesis" {
  const q = question.toLowerCase();
  return SYNTHESIS_TRIGGERS.some((t) => q.includes(t)) ? "synthesis" : "simple";
}

// ── Single-query generation (SIMPLE questions) ──────────────────────────────

const SYSTEM_PROMPT = `You are a Cypher query generator for a Neo4j graph database.

SCHEMA (STRICT — the graph contains ONLY this):
- Node labels (the ONLY three that exist): ${NODE_LABELS_STR}.
- Relationship types (the ONLY six that exist — do NOT invent or rename any): ${REL_TYPES_STR}.
- Every node has a "name" property. Examples: "Alice", "CHRONO-109", "GCP", "PostgreSQL".
- Every relationship has exactly two properties: "timestamp" (ISO datetime string) and "source_id" (e.g. "rec_001").
- People in the graph: Alice, Bob, Charlie, Dave, Eve. Match them as (p:Person {name: "Alice"}).
- Tickets are named like CHRONO-109 (uppercase, no "Ticket " prefix). Match as (t:Ticket {name: "CHRONO-109"}).
- Technologies include AWS, GCP, Cloud SQL, BigQuery, GKE, Redshift, PostgreSQL, Terraform, S3, IAM, etc.

HARD RULES:
1. Read-only only: MATCH / OPTIONAL MATCH / WHERE / WITH / RETURN / ORDER BY / LIMIT / SKIP / UNWIND. NEVER use CREATE, DELETE, MERGE, SET, REMOVE, DROP.
2. NEVER invent a relationship type. Only the six listed above may appear after a colon in a relationship pattern (-[r:TYPE]-).
3. Every variable you reference in WHERE, RETURN, or ORDER BY must be bound by a name in a MATCH pattern. Always name your relationships (-[r:TYPE]->). NEVER use an anonymous relationship (-[]->) and then reference it later.
4. Always include r.timestamp and r.source_id in the RETURN clause so evidence can be cited.
5. Prefer the SIMPLEST possible query — a single MATCH with at most one relationship. No multi-hop paths, no subqueries, no APOC, no EXISTS pattern predicates.
6. Order results by r.timestamp ASC (use DESC only for "recent"/"latest" questions).
7. Output ONLY the raw Cypher query — no explanations, no markdown code fences, no trailing semicolon.

Worked examples:

Example A — "Who committed code related to GCP?"
MATCH (p:Person)-[r:COMMITTED_CODE]->(t:Technology)
WHERE t.name CONTAINS "GCP" OR t.name CONTAINS "gcp"
RETURN p.name AS person, t.name AS technology, r.timestamp AS timestamp, r.source_id AS source_id
ORDER BY r.timestamp ASC

Example B — "Who argued against GCP?"
MATCH (p:Person)-[r:ARGUED_AGAINST]->(t:Technology {name: "GCP"})
RETURN p.name AS person, t.name AS technology, r.timestamp AS timestamp, r.source_id AS source_id
ORDER BY r.timestamp ASC

Example C — "What did Alice work on?"
MATCH (p:Person {name: "Alice"})-[r]->(n)
RETURN p.name AS person, n.name AS entity, r.timestamp AS timestamp, r.source_id AS source_id
ORDER BY r.timestamp ASC`;

// ── Multi-query generation (SYNTHESIS questions) ────────────────────────────

const SUBQUERY_SYSTEM_PROMPT = `You write 2-4 independent, single-hop, read-only Cypher queries for a Neo4j graph. Together they answer a broad question about an engineering team's cloud-migration history.

SCHEMA (STRICT — only this exists; never invent anything):
- Node labels: Person, Technology, Ticket. Every node has a "name" property.
- Relationship types (the ONLY six): ${REL_TYPES_STR}.
- Direction: every relationship goes Person -> Technology/Ticket:
  (p:Person)-[:ADVOCATED_FOR|ARGUED_AGAINST|COMMITTED_CODE|MENTIONED]->(n:Technology)
  (p:Person)-[:ASSIGNED_TO|RESOLVED]->(t:Ticket)
- People: Alice, Bob, Charlie, Dave, Eve. Tickets: CHRONO-109 (no "Ticket " prefix). Technologies: AWS, GCP, Cloud SQL, BigQuery, GKE, Redshift, PostgreSQL, Terraform, S3, IAM, plus phrase names like "database migration", "moving our primary Postgres database".
- Every relationship has two properties: "timestamp" (ISO datetime), "source_id".

TASK: infer the question's topic entities (people / technologies / tickets). Generate 2-4 queries, each with a DIFFERENT relationship type, so the merged results tell the whole story — e.g. one ADVOCATED_FOR / ARGUED_AGAINST (reasons and concerns), one COMMITTED_CODE (work done), one RESOLVED / ASSIGNED_TO (tickets), one MENTIONED (discussion).

PER QUERY:
- ONE MATCH, ONE hop, ONE relationship. No multi-hop, subqueries, EXISTS, or WITH.
- Read-only only: MATCH / WHERE / RETURN / ORDER BY / LIMIT. NEVER CREATE, DELETE, MERGE, SET, REMOVE, DROP.
- Always name the relationship (-[r:TYPE]->). Every variable in WHERE / RETURN / ORDER BY must be bound in the MATCH pattern.
- Filter technology targets with CONTAINS using BOTH cases, and include EVERY topic entity in the question (for a migration question: "AWS","aws","GCP","gcp" plus database/Postgres/Cloud SQL terms). Avoid exact-name filters unless certain.
- People: MATCH (p:Person {name: "Dave"}).
- RETURN p.name AS person, n.name AS entity (or t.name AS ticket), r.timestamp AS timestamp, r.source_id AS source_id. Keep these aliases EXACTLY — never rename r.timestamp or r.source_id. ORDER BY r.timestamp ASC. LIMIT 30.

OUTPUT: ONLY a JSON object with a "queries" array of 2-4 Cypher strings. No markdown fences, no prose.
Inline example: {"queries": ["MATCH (p:Person)-[r:ADVOCATED_FOR]->(n:Technology) WHERE n.name CONTAINS \"GCP\" OR n.name CONTAINS \"gcp\" RETURN p.name AS person, n.name AS entity, r.timestamp AS timestamp, r.source_id AS source_id ORDER BY r.timestamp ASC LIMIT 30"]}`;

/** Best-effort cleanup: strip markdown fences and stray prose the model may add. */
function cleanCypher(raw: string): string {
  let q = raw.trim();
  // Remove ```cypher ... ``` or ``` ... ``` fences.
  q = q.replace(/^```(?:cypher|neo4j)?\s*/i, "").replace(/```\s*$/, "");
  q = q.trim();
  // If the model wrapped it in a code block with language on its own line, drop that line.
  q = q.replace(/^(?:cypher|neo4j)\n/i, "");
  // Drop any trailing semicolon.
  q = q.replace(/;\s*$/, "");
  return q.trim();
}

/** Extract a string[] of cleaned Cypher queries from an already-parsed JSON value. */
function queriesFromParsed(parsed: unknown): string[] {
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { queries?: unknown })?.queries)
    ? ((parsed as { queries: unknown[] }).queries as unknown[])
    : null;
  if (!arr) return [];
  return arr
    .filter((q): q is string => typeof q === "string")
    .map(cleanCypher)
    .filter((q) => q.length > 0);
}

/** Parse a Groq response into an array of cleaned Cypher query strings. */
function parseQueriesJson(content: string): string[] {
  const cleaned = content.trim().replace(/^```(?:json)?\s*|\s*```\s*$/gi, "");

  // 1) Whole response is JSON: {"queries": [...]} or bare [...] (json_object mode).
  try {
    const found = queriesFromParsed(JSON.parse(cleaned) as unknown);
    if (found.length) return found;
  } catch {
    // fall through
  }

  // 2) JSON embedded in prose: extract the {"queries": [...]} object, else [...].
  const objMatch = cleaned.match(/\{\s*"queries"\s*:\s*\[[\s\S]*?\]\s*\}/i);
  if (objMatch) {
    try {
      const found = queriesFromParsed(JSON.parse(objMatch[0]) as unknown);
      if (found.length) return found;
    } catch {
      // fall through
    }
  }
  const bracket = cleaned.match(/\[[\s\S]*\]/);
  if (bracket) {
    try {
      const found = queriesFromParsed(JSON.parse(bracket[0]) as unknown);
      if (found.length) return found;
    } catch {
      // fall through
    }
  }

  // 3) Plain-text list: non-empty lines that start with MATCH.
  return cleaned
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^MATCH/i.test(l))
    .map(cleanCypher)
    .filter((q) => q.length > 0);
}

/**
 * Generate 2–4 independent, single-hop, read-only Cypher queries that together
 * answer a broad SYNTHESIS question (different relationship types each).
 *
 * @param question  The user's natural-language question.
 * @param feedback  Optional feedback from pre-flight validation of a previous
 *                  attempt (per-query errors). Used for the one-shot retry.
 * @throws          When Groq fails or returns no usable queries.
 */
export async function generateSubQueries(question: string, feedback?: string): Promise<string[]> {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: SUBQUERY_SYSTEM_PROMPT },
    { role: "user", content: question },
  ];
  if (feedback) {
    messages.push({
      role: "user",
      content: `Your previous set of queries was rejected before it could run. Reasons:\n${feedback}\n\nGenerate a corrected set, still as a JSON object with a "queries" array.`,
    });
  }

  const data = await groqChat({
    model: GROQ_MODEL,
    temperature: 0.2,
    max_completion_tokens: 4096,
    reasoning_format: "hidden",
    response_format: { type: "json_object" },
    messages,
  });

  const content = data.choices?.[0]?.message?.content ?? "";
  const queries = parseQueriesJson(content);
  if (queries.length === 0) throw new Error("Groq returned no valid Cypher queries");
  return queries.slice(0, 4);
}

/**
 * Generate a read-only Cypher query for the given question.
 *
 * @param question  The user's natural-language question.
 * @param feedback  Optional feedback from pre-flight validation of a previous
 *                  attempt. When present, the model is told exactly what was
 *                  wrong so it can generate a corrected query (one-shot retry).
 */
export async function generateCypher(question: string, feedback?: string): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: question },
  ];
  if (feedback) {
    messages.push({
      role: "user",
      content: `Your previous query was rejected before it could run. Reasons:\n${feedback}\n\nGenerate a corrected query that follows the schema and hard rules above.`,
    });
  }

  const data = await groqChat({
    model: GROQ_MODEL,
    temperature: 0.2,
    max_completion_tokens: 2048,
    messages,
  });

  const content = data.choices?.[0]?.message?.content ?? "";
  const query = cleanCypher(content);
  if (!query) throw new Error("Groq returned an empty Cypher query");
  return query;
}
