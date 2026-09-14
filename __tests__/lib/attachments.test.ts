/**
 * Tests for lib/attachments.ts — text extraction (content/base64/empty) and
 * the document-only answering path (groqChat via fetch, mocked).
 */
jest.mock("pdf-parse/lib/pdf-parse.js", () => {
  const fn = jest.fn(async () => ({ text: "parsed pdf text" }));
  return { __esModule: true, default: fn };
});

import pdf from "pdf-parse/lib/pdf-parse.js";
import { extractAttachmentText, handleAttachment, MAX_FILE_CHARS } from "@/lib/attachments";

const pdfMock = pdf as jest.Mock;

describe("extractAttachmentText", () => {
  it("passes text content straight through", async () => {
    const { text, error } = await extractAttachmentText({ content: "hello world" });
    expect(text).toBe("hello world");
    expect(error).toBeUndefined();
  });

  it("truncates oversized text content to MAX_FILE_CHARS", async () => {
    const { text } = await extractAttachmentText({ content: "x".repeat(MAX_FILE_CHARS + 500) });
    expect(text).toHaveLength(MAX_FILE_CHARS);
  });

  it("rejects oversized base64 before attempting a parse", async () => {
    const { text, error } = await extractAttachmentText({ base64: "A".repeat(7_000_001) });
    expect(text).toBe("");
    expect(error).toMatch(/too large/i);
    expect(pdfMock).not.toHaveBeenCalled();
  });

  it("decodes base64 PDFs through pdf-parse", async () => {
    const { text, error } = await extractAttachmentText({ base64: "aGVsbG8=" });
    expect(pdfMock).toHaveBeenCalled();
    expect(text).toBe("parsed pdf text");
    expect(error).toBeUndefined();
  });

  it("reports a parse failure from the PDF parser", async () => {
    pdfMock.mockRejectedValueOnce(new Error("corrupt xref"));
    const { text, error } = await extractAttachmentText({ base64: "aGVsbG8=" });
    expect(text).toBe("");
    expect(error).toMatch(/corrupt xref/);
  });

  it("reports an empty error for attachments with no readable content", async () => {
    const { text, error } = await extractAttachmentText({});
    expect(text).toBe("");
    expect(error).toMatch(/no readable content/i);
  });
});

describe("handleAttachment", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockFetchWith(payload: unknown, ok = true, status = 200) {
    return jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), { status, statusText: ok ? "OK" : "Error" })
    );
  }

  it("answers from the document and returns a single file source card", async () => {
    mockFetchWith({
      choices: [{ message: { content: "  The document says migration is on track.  " } }],
    });

    const res = await handleAttachment("What is the status?", {
      name: "status.md",
      type: "text/markdown",
      content: "The document says migration is on track.",
    });
    const body = (await res.json()) as { answer: string; sources: Array<{ id: string; platform: string }> };

    expect(body.answer).toBe("The document says migration is on track.");
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0]).toMatchObject({ id: "file:status.md", platform: "file" });
  });

  it("returns a graceful message when the document has no readable text", async () => {
    const fetchSpy = mockFetchWith({});
    const res = await handleAttachment("hello?", { name: "empty.txt", type: "text/plain", content: "   " });
    const body = (await res.json()) as { answer: string; sources: unknown[] };

    expect(body.answer).toMatch(/couldn't read text/i);
    expect(body.sources).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back gracefully when the LLM call fails", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("rate limited"));
    const res = await handleAttachment("q", { name: "doc.txt", type: "text/plain", content: "content" });
    const body = (await res.json()) as { answer: string; sources: unknown[] };

    expect(body.answer).toMatch(/summarizer failed/i);
    expect(body.sources).toHaveLength(0);
  });

  it("uses the default document name when none is provided", async () => {
    mockFetchWith({ choices: [{ message: { content: "answer" } }] });
    const res = await handleAttachment("q", { type: "text/plain", content: "content" });
    const body = (await res.json()) as { sources: Array<{ id: string }> };
    expect(body.sources[0].id).toBe("file:attached-document");
  });
});
