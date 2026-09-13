import { NextRequest, NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import { classifyQuestion, generateCypher, generateSubQueries } from "@/lib/textToCypher";
import { isSafeReadOnlyCypher, validateCypherStructure } from "@/lib/cypherSafety";
import { loadRecordMap, PlainRecord } from "@/lib/datasetRecords";
import {
  buildSources,
  sampleEvenly,
  sortByTimestamp,
  MAX_CONTEXT_RECORDS,
} from "@/lib/graphResults";
import { AttachmentInput, handleAttachment } from "@/lib/attachments";
import { generateNarrative } from "@/lib/narrative";
import { logger } from "@/lib/logger";

const log = logger("chrono-cypher");

// How long we allow Neo4j to run the generated query before giving up.
const NEO4J_TIMEOUT_MS = 25_000;

/**
 * Two-stage retrieval for SYNTHESIS questions: generate several independent
 * single-hop queries (different relationship types), validate EVERY one with
 * the same safety checks as the simple path, run them all, merge the rows
 * chronologically, and let the narrative LLM weave them into a coherent
 * answer. Every failure path returns a graceful HTTP-200 fallback — broken
 * Cypher never reaches Neo4j.
 */
async function handleSynthesis(question: string): Promise<NextResponse> {
  // 1) Generate 2–4 independent single-hop queries (one per relationship type).
  let queries: string[];
  try {
    queries = await generateSubQueries(question);
  } catch (err) {
    // One-shot retry on generation/parse failure (rate limits are already
    // retried with backoff inside groqChat).
    const msg = err instanceof Error ? err.message : "unknown error";
    log.warn(`subquery generation failed — retrying once`, { error: msg });
    try {
      queries = await generateSubQueries(
        question,
        `Your previous output could not be used (${msg}). Respond with ONLY a JSON object: {"queries": ["MATCH ...", "MATCH ..."]}.`
      );
    } catch (err2) {
      const msg2 = err2 instanceof Error ? err2.message : "unknown error";
      log.error(`subquery generation retry failed`, { error: msg2 });
      return NextResponse.json({
        answer: `I couldn't generate knowledge-graph queries for that question. Please rephrase it. (${msg2})`,
        sources: [],
      });
    }
  }
  log.debug(`subqueries (attempt 1)`, { queries });

  // 2) Pre-flight validation on EVERY query — no exceptions. Retry once if any fail.
  const checkAll = (qs: string[]) =>
    qs.map((query) => {
      const safetyOk = isSafeReadOnlyCypher(query);
      const validation = validateCypherStructure(query);
      return { query, safetyOk, validation };
    });

  let checked = checkAll(queries);
  const invalid = checked.filter((c) => !c.safetyOk || !c.validation.ok);
  if (invalid.length > 0) {
    const reasons = invalid
      .map((c) => {
        const parts = [
          ...(!c.safetyOk
            ? ["contains a write operation (CREATE/DELETE/MERGE/SET/REMOVE/DROP)"]
            : []),
          ...c.validation.errors,
        ];
        return `Query: ${c.query}\n  - ${parts.join("\n  - ")}`;
      })
      .join("\n");
    log.warn(`validation failed for ${invalid.length}/${queries.length} subqueries — retrying generation once`, { reasons });
    try {
      const retried = await generateSubQueries(question, reasons);
      log.debug(`subqueries (attempt 2 / retry)`, { queries: retried });
      checked = checkAll(retried);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      log.warn(`subquery retry failed`, { error: msg });
    }
  }

  const valid = checked.filter((c) => c.safetyOk && c.validation.ok);
  const stillInvalid = checked.filter((c) => !c.safetyOk || !c.validation.ok);
  if (stillInvalid.length > 0) {
    log.warn(`${stillInvalid.length} subqueries still invalid after retry — dropped (NOT run)`, {
      queries: stillInvalid.map((c) => c.query),
    });
  }
  if (valid.length === 0) {
    return NextResponse.json({
      answer:
        "I couldn't generate any valid knowledge-graph queries for that question (every candidate was rejected by safety validation). Please rephrase it.",
      sources: [],
    });
  }

  // 3) Run all valid queries against Neo4j in parallel, each with its own timeout.
  const timers: ReturnType<typeof setTimeout>[] = [];
  const results = await Promise.allSettled(
    valid.map(({ query }) =>
      Promise.race([
        runQuery(query),
        new Promise<never>((_, reject) => {
          timers.push(
            setTimeout(
              () =>
                reject(new Error(`Neo4j query timed out after ${NEO4J_TIMEOUT_MS / 1000}s`)),
              NEO4J_TIMEOUT_MS
            )
          );
        }),
      ])
    )
  );
  timers.forEach((t) => clearTimeout(t));

  const merged: PlainRecord[] = [];
  const failures: string[] = [];
  results.forEach((res, i) => {
    if (res.status === "fulfilled") {
      log.debug(`subquery ${i + 1} rows`, { rows: res.value.length, query: valid[i].query });
      merged.push(...res.value);
    } else {
      const msg = res.reason instanceof Error ? res.reason.message : String(res.reason);
      log.warn(`subquery ${i + 1} failed`, { error: msg });
      failures.push(`${valid[i].query} — ${msg}`);
    }
  });

  if (merged.length === 0) {
    const detail = failures.length
      ? ` All ${failures.length} sub-queries failed: ${failures.join(" | ")}`
      : "";
    return NextResponse.json({
      answer: `No matching data was found in the knowledge graph for: "${question}".${detail}`,
      sources: [],
    });
  }

  // 4) Merge chronologically; if too many rows, sample evenly across the timeline.
  const sorted = sortByTimestamp(merged);
  const sampled = sampleEvenly(sorted, MAX_CONTEXT_RECORDS);
  log.debug(`merged rows for narrative`, { merged: merged.length, subqueries: valid.length, sampled: sampled.length });

  // 5) Narrative answer from the merged graph results.
  const narrative = await generateNarrative(
    question,
    valid.map((c) => c.query),
    sampled
  );
  const sources = buildSources(narrative.refs, loadRecordMap(), narrative.sourceIds);

  log.info(`synthesis answer ready`, {
    answerPreview: narrative.answer.slice(0, 300),
    sources: sources.map((s) => ({ id: s.id, timestamp: s.timestamp })),
  });

  return NextResponse.json({ answer: narrative.answer, sources });
}

// ── Route ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const question = typeof body?.question === "string" ? body.question.trim() : "";

    if (!question) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }
    if (question.length > 2000) {
      return NextResponse.json(
        { error: "Question is too long (max 2000 characters)" },
        { status: 400 }
      );
    }
    if (!process.env.GROK_API_KEY) {
      return NextResponse.json(
        { error: "GROK_API_KEY is not configured. Add it to .env" },
        { status: 500 }
      );
    }

    log.info(`question received`, { question });

    // 0a) File-attachment questions bypass the graph entirely: the document
    //     itself is the context.
    const attachment: AttachmentInput | undefined = body?.attachment as AttachmentInput | undefined;
    if (attachment && typeof attachment === "object") {
      log.debug(`attachment received`, {
        name: attachment.name,
        type: attachment.type,
        hasContent: typeof attachment.content === "string",
        hasBase64: typeof attachment.base64 === "string",
      });
      return handleAttachment(question, attachment);
    }

    // 0) Two-stage retrieval: classify the question first.
    const kind = classifyQuestion(question);
    log.debug(`classification`, { kind });

    // Broad "why / how / what happened / timeline" questions spanning multiple
    // relationship types use the multi-query pipeline (several independent
    // single-hop queries merged chronologically). Everything else uses the
    // single-query pipeline below, unchanged.
    if (kind === "synthesis") {
      return handleSynthesis(question);
    }

    // 1) Natural language → Cypher
    let cypher: string;
    try {
      cypher = await generateCypher(question);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      log.warn(`Cypher generation failed`, { error: msg });
      return NextResponse.json({
        answer: `I couldn't generate a knowledge-graph query for that question. Please rephrase it. (${msg})`,
        sources: [],
      });
    }
    log.debug(`generated Cypher`, { cypher });

    // 2) Safety gate + pre-flight structural validation (with ONE retry).
    //    Never let broken or unknown-schema Cypher reach Neo4j.
    let safetyOk = isSafeReadOnlyCypher(cypher);
    let validation = validateCypherStructure(cypher);
    if (!safetyOk || !validation.ok) {
      const reasons = [
        ...(!safetyOk
          ? ["query contains a write operation (CREATE/DELETE/MERGE/SET/REMOVE/DROP)"]
          : []),
        ...validation.errors,
      ];
      log.warn(`validation failed (attempt 1) — retrying generation once`, { reasons });

      try {
        cypher = await generateCypher(
          question,
          `Your previous query was:\n\`\`\`\n${cypher}\n\`\`\`\n\n- ${reasons.join("\n- ")}`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        log.warn(`Cypher retry failed`, { error: msg });
        return NextResponse.json({
          answer: `I couldn't generate a valid knowledge-graph query for that question. Please rephrase it. (${msg})`,
          sources: [],
        });
      }
      log.debug(`retry generated Cypher`, { cypher });

      safetyOk = isSafeReadOnlyCypher(cypher);
      validation = validateCypherStructure(cypher);
      if (!safetyOk) {
        log.warn("REJECTED after retry — write operation detected (query NOT run)");
        return NextResponse.json({
          answer:
            "I can only run read-only queries, but the generated query contained a write operation, so it was blocked before execution. Please rephrase your question.",
          sources: [],
        });
      }
      if (!validation.ok) {
        log.warn(`validation failed after retry — returning graceful fallback (query NOT run)`, {
          errors: validation.errors,
        });
        return NextResponse.json({
          answer: `I couldn't generate a valid knowledge-graph query for that question. It was checked before running and flagged: ${validation.errors.join("; ")}. Please rephrase your question.`,
          sources: [],
        });
      }
    }

    // 3) Execute against Neo4j
    let rows: PlainRecord[];
    let queryTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      rows = await Promise.race([
        runQuery(cypher),
        new Promise<never>((_, reject) => {
          queryTimer = setTimeout(
            () => reject(new Error(`Neo4j query timed out after ${NEO4J_TIMEOUT_MS / 1000}s`)),
            NEO4J_TIMEOUT_MS
          );
        }),
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      log.warn(`Neo4j query failed`, { error: msg });
      return NextResponse.json({
        answer: `The knowledge-graph query failed — Neo4j may be unreachable or the generated Cypher was invalid. Details: ${msg}`,
        sources: [],
      });
    } finally {
      if (queryTimer) clearTimeout(queryTimer);
    }
    log.debug(`neo4j rows returned`, { rows: rows.length });

    if (rows.length === 0) {
      return NextResponse.json({
        answer: `No matching data was found in the knowledge graph for: "${question}". The generated query matched zero relationships.`,
        sources: [],
      });
    }

    // 4) Narrative answer from the graph results (shared with the synthesis pipeline)
    const narrative = await generateNarrative(question, [cypher], rows);

    // 5) Sources — source_id + timestamp pulled from the relationship properties
    const sources = buildSources(narrative.refs, loadRecordMap(), narrative.sourceIds);

    log.info(`answer ready`, {
      answerPreview: narrative.answer.slice(0, 300),
      sources: sources.map((s) => ({ id: s.id, timestamp: s.timestamp })),
    });

    return NextResponse.json({ answer: narrative.answer, sources });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error(`ROUTE ERROR`, { error: message });
    return NextResponse.json({ error: `Chat request failed: ${message}` }, { status: 500 });
  }
}
