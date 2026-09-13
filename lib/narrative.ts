/**
 * narrative.ts
 *
 * Narrative stage of the chat pipeline: ask the LLM to turn raw graph rows
 * into a grounded, chronological answer with cited source_ids. Extracted
 * from app/api/chat/route.ts so it is unit-testable without Next.js.
 */
import { groqChat } from "@/lib/textToCypher";
import { buildContextFromRecords, MAX_CONTEXT_RECORDS } from "@/lib/graphResults";
import { PlainRecord } from "@/lib/datasetRecords";
import { logger } from "@/lib/logger";

const log = logger("chrono-cypher");

const GROQ_MODEL = "openai/gpt-oss-120b";

export interface NarrativeResult {
  answer: string;
  sourceIds: string[];
  refs: Map<string, string>;
}

/**
 * Ask the narrative LLM to turn raw graph rows into a grounded answer.
 * Shared by the simple (single-query) and synthesis (multi-query) pipelines.
 * On summarizer failure it returns an honest fallback with whatever sources
 * were found, so the frontend never crashes.
 */
export async function generateNarrative(
  question: string,
  queries: string[],
  rows: PlainRecord[]
): Promise<NarrativeResult> {
  const { context, refs } = buildContextFromRecords(rows);

  const systemPrompt = `You are ChronoGraph, a forensic engineering-intelligence assistant.

The lines below are the RAW result rows returned by Cypher queries against a Neo4j
knowledge graph built from an engineering team's Slack messages, Git commits, and Jira
tickets. Each line is one database row. Nodes are shown as Label(name); relationships are
shown as REL_TYPE with properties including timestamp (when the underlying message, commit,
or ticket was created) and source_id (the id of the original record). Rows are in
chronological order.

Answer the user's question using ONLY these rows.
Rules:
- Be concise and factual, grounded strictly in the rows. If the rows don't contain enough
  information to answer, say so honestly.
- This is a story that unfolded over time — where the question asks for one, weave the
  rows into a coherent chronological narrative: what happened, when, and by whom.
- For time-based questions, state the date of each event you describe.
- Only cite source_ids that actually appear in the rows — cite at most 10, and only the
  ones you truly used.
- Respond as JSON with exactly two keys: "answer" (string, the full answer) and
  "source_ids" (array of the source_id strings you used, deduplicated).`;

  const userPrompt = `Question: ${question}

Cypher queries that produced these results:
${queries.join("\n\n---\n\n")}

Result rows (${Math.min(rows.length, MAX_CONTEXT_RECORDS)} of ${rows.length}):
${context}`;

  const data = await groqChat(
    {
      model: GROQ_MODEL,
      temperature: 0.3,
      max_completion_tokens: 4096,
      reasoning_format: "hidden",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    },
    45_000
  ).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : "unknown error";
    log.error(`narrative LLM failed`, { error: msg });
    return null;
  });

  if (!data) {
    return {
      answer: `I found ${rows.length} graph records for that question, but the summarizer failed. Please try again.`,
      sourceIds: [],
      refs,
    };
  }
  const content = data.choices?.[0]?.message?.content ?? "";

  // Best-effort JSON parse; fall back to raw text if the model didn't comply.
  const cleaned = content.trim().replace(/^```(?:json)?\s*|\s*```\s*$/gi, "");
  let answer = cleaned;
  let sourceIds: string[] = [];
  try {
    const parsed = JSON.parse(cleaned);
    answer = typeof parsed.answer === "string" ? parsed.answer : content;
    sourceIds = Array.isArray(parsed.source_ids)
      ? Array.from(
          new Set(
            parsed.source_ids.filter((id: unknown): id is string => typeof id === "string")
          )
        )
      : [];
  } catch {
    // keep raw content as answer
  }

  return { answer, sourceIds, refs };
}
