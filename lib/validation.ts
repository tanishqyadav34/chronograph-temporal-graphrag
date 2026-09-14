/**
 * validation.ts
 *
 * Zod request-body schemas for the API boundary. Each route parses its
 * NextRequest body through `parseBody` and returns 400 with the first
 * validation message on failure — malformed input never reaches handlers.
 */
import { z } from "zod";

/** A file attached to a chat question. Text files carry `content`; PDFs carry `base64`. */
export const AttachmentSchema = z.object({
  name: z.string().max(255),
  type: z.string().max(255),
  content: z.string().max(20_000).optional(),
  base64: z.string().max(10_000_000).optional(),
});

export const ChatRequestSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "Question is required")
    .max(2000, "Question is too long (max 2000 characters)"),
  attachment: AttachmentSchema.nullish(),
});

export const SignupRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(80, "Name is too long."),
  email: z
    .string()
    .trim()
    .transform((s) => s.toLowerCase())
    .refine(
      (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s),
      "Please enter a valid email address."
    ),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(200, "Password is too long."),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; errors: string[] };

/** Parse an unknown request body against a schema; collect error messages. */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): ParseResult<T> {
  const result = schema.safeParse(body);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((issue) => issue.message),
  };
}
