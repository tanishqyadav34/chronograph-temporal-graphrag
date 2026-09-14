/**
 * Tests for lib/validation.ts — zod request-body schemas.
 */
import {
  AttachmentSchema,
  ChatRequestSchema,
  SignupRequestSchema,
  parseBody,
} from "@/lib/validation";

describe("ChatRequestSchema", () => {
  it("accepts a plain question", () => {
    const result = parseBody(ChatRequestSchema, { question: "Who fixed the bug?" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.question).toBe("Who fixed the bug?");
  });

  it("accepts a question with a full attachment", () => {
    const result = parseBody(ChatRequestSchema, {
      question: "Summarize this",
      attachment: { name: "notes.txt", type: "text/plain", content: "hello" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty question", () => {
    const result = parseBody(ChatRequestSchema, { question: "   " });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]).toMatch(/required/i);
  });

  it("rejects a missing question", () => {
    const result = parseBody(ChatRequestSchema, {});
    expect(result.success).toBe(false);
  });

  it("rejects an over-long question", () => {
    const result = parseBody(ChatRequestSchema, { question: "x".repeat(2001) });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]).toMatch(/max 2000/i);
  });

  it("rejects a non-object body", () => {
    expect(parseBody(ChatRequestSchema, "hello").success).toBe(false);
    expect(parseBody(ChatRequestSchema, 42).success).toBe(false);
    expect(parseBody(ChatRequestSchema, null).success).toBe(false);
  });

  it("rejects an attachment with oversized base64", () => {
    const result = parseBody(ChatRequestSchema, {
      question: "q",
      attachment: { base64: "A".repeat(10_000_001) },
    });
    expect(result.success).toBe(false);
  });
});

describe("SignupRequestSchema", () => {
  it("accepts valid signup data and lowercases the email", () => {
    const result = parseBody(SignupRequestSchema, {
      name: "  Alice  ",
      email: "Alice@Example.COM",
      password: "longenough1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Alice");
      expect(result.data.email).toBe("alice@example.com");
    }
  });

  it("rejects an invalid email", () => {
    const result = parseBody(SignupRequestSchema, {
      name: "Alice",
      email: "not-an-email",
      password: "longenough1",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]).toMatch(/valid email/i);
  });

  it("rejects a short password", () => {
    const result = parseBody(SignupRequestSchema, {
      name: "Alice",
      email: "a@b.co",
      password: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]).toMatch(/at least 8/i);
  });

  it("rejects a missing name", () => {
    const result = parseBody(SignupRequestSchema, {
      email: "a@b.co",
      password: "longenough1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an over-long name", () => {
    const result = parseBody(SignupRequestSchema, {
      name: "x".repeat(81),
      email: "a@b.co",
      password: "longenough1",
    });
    expect(result.success).toBe(false);
  });
});

describe("AttachmentSchema", () => {
  it("requires name and type to match AttachmentPayload", () => {
    expect(AttachmentSchema.safeParse({}).success).toBe(false);
    expect(AttachmentSchema.safeParse({ name: "f.txt", type: "text/plain" }).success).toBe(true);
  });

  it("rejects non-string fields", () => {
    expect(AttachmentSchema.safeParse({ name: 42 }).success).toBe(false);
  });
});

describe("parseBody", () => {
  it("collects multiple error messages", () => {
    const result = parseBody(SignupRequestSchema, { name: "", email: "bad", password: "x" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
