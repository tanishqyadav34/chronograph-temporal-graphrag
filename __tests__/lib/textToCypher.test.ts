/**
 * Tests for lib/textToCypher.ts parsing logic and lib/narrative.ts, with a
 * mocked global fetch — the full Groq pipeline is testable without a live
 * API key or network access.
 */
import { classifyQuestion, generateCypher, generateSubQueries } from "@/lib/textToCypher";
import { generateNarrative } from "@/lib/narrative";

/** Build a minimal Response-like object for groqChat's fetch call. */
function groqResponse(content: string): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    text: async () => content,
    json: async () => ({ choices: [{ message: { content } }] }),
  } as unknown as Response;
}

let fetchSpy: jest.SpyInstance;

/** Queue a Groq reply: the next fetch call resolves with the given content. */
function nextGroqReply(content: string): void {
  fetchSpy.mockResolvedValueOnce(groqResponse(content));
}

/** Parse the JSON body sent to the (mocked) Groq endpoint. */
function lastRequestBody(): { messages: Array<{ role: string; content: string }> } {
  const [, init] = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
  return JSON.parse(String(init?.body));
}

beforeEach(() => {
  fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(groqResponse(""));
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("classifyQuestion", () => {
  it.each([
    "Why did we migrate from AWS to GCP?",
    "How did the migration go?",
    "What happened after the cutover?",
    "Give me a timeline of the migration",
    "Summarize the project",
  ])("classifies broad question as synthesis: %s", (q) => {
    expect(classifyQuestion(q)).toBe("synthesis");
  });

  it.each([
    "Who committed code related to GCP?",
    "What did Alice work on?",
    "Who argued against Terraform?",
  ])("classifies targeted question as simple: %s", (q) => {
    expect(classifyQuestion(q)).toBe("simple");
  });
});

describe("generateCypher", () => {
  it("strips markdown fences and semicolons from the model output", async () => {
    nextGroqReply("```cypher\nMATCH (p:Person) RETURN p.name;\n```");
    const q = await generateCypher("Who is in the graph?");
    expect(q).toBe("MATCH (p:Person) RETURN p.name");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws on empty model output", async () => {
    nextGroqReply("");
    await expect(generateCypher("q")).rejects.toThrow(/empty Cypher/);
  });

  it("sends the question as a user message after the system prompt", async () => {
    nextGroqReply("MATCH (n) RETURN n");
    await generateCypher("Who is in the graph?");
    const body = lastRequestBody();
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].content).toBe("Who is in the graph?");
  });

  it("passes feedback messages on retry", async () => {
    nextGroqReply("MATCH (n) RETURN n");
    await generateCypher("q", "your query was rejected because X");
    const body = lastRequestBody();
    expect(body.messages).toHaveLength(3); // system + user + feedback
    expect(body.messages[2].content).toContain("rejected");
  });
});

describe("generateSubQueries", () => {
  it("parses a JSON object with a queries array", async () => {
    nextGroqReply(
      JSON.stringify({
        queries: [
          "MATCH (p:Person)-[r:ADVOCATED_FOR]->(n:Technology) RETURN p.name LIMIT 30",
          "MATCH (p:Person)-[r:COMMITTED_CODE]->(n:Technology) RETURN p.name LIMIT 30",
        ],
      })
    );
    const queries = await generateSubQueries("Why did we migrate?");
    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain("ADVOCATED_FOR");
  });

  it("extracts a queries array embedded in prose", async () => {
    nextGroqReply(
      'Here you go: {"queries": ["MATCH (p:Person)-[r:MENTIONED]->(n) RETURN p.name"]} hope that helps'
    );
    const queries = await generateSubQueries("q");
    expect(queries).toEqual(["MATCH (p:Person)-[r:MENTIONED]->(n) RETURN p.name"]);
  });

  it("caps the number of queries at 4", async () => {
    nextGroqReply(
      JSON.stringify({
        queries: [
          "MATCH (a) RETURN 1",
          "MATCH (a) RETURN 2",
          "MATCH (a) RETURN 3",
          "MATCH (a) RETURN 4",
          "MATCH (a) RETURN 5",
        ],
      })
    );
    expect(await generateSubQueries("q")).toHaveLength(4);
  });

  it("throws when no valid queries are returned", async () => {
    nextGroqReply("no json here");
    await expect(generateSubQueries("q")).rejects.toThrow(/no valid Cypher/);
  });

  it("requests json_object response format", async () => {
    nextGroqReply(JSON.stringify({ queries: ["MATCH (a) RETURN 1"] }));
    await generateSubQueries("q");
    const body = lastRequestBody();
    expect(body.messages[0].role).toBe("system");
  });
});

describe("generateNarrative", () => {
  it("parses the JSON response into answer + source_ids", async () => {
    nextGroqReply(
      JSON.stringify({
        answer: "Alice led the migration.",
        source_ids: ["rec_001", "rec_001", "rec_002"],
      })
    );
    const res = await generateNarrative("q", ["MATCH (n) RETURN n"], [
      { edge: { source_id: "rec_001", timestamp: "2023-01-01T00:00:00Z" } },
    ]);
    expect(res.answer).toBe("Alice led the migration.");
    expect(res.sourceIds).toEqual(["rec_001", "rec_002"]); // deduped
    expect(res.refs.get("rec_001")).toBe("2023-01-01T00:00:00Z");
  });

  it("falls back to raw text when the model ignores JSON mode", async () => {
    nextGroqReply("plain answer, no json");
    const res = await generateNarrative("q", [], [
      { edge: { source_id: "rec_001", timestamp: "2023-01-01T00:00:00Z" } },
    ]);
    expect(res.answer).toBe("plain answer, no json");
    expect(res.sourceIds).toEqual([]);
  });

  it("returns an honest fallback when the LLM call fails", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("rate limited"));
    const res = await generateNarrative("q", [], [
      { edge: { source_id: "rec_001", timestamp: "2023-01-01T00:00:00Z" } },
    ]);
    expect(res.answer).toContain("summarizer failed");
    expect(res.sourceIds).toEqual([]);
    expect(res.refs.get("rec_001")).toBe("2023-01-01T00:00:00Z");
  });
});
