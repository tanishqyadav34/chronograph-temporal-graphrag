export interface Source {
  id: string;
  title: string;
  excerpt: string;
  timestamp: string;
  platform: "slack" | "github" | "jira" | "file";
  metadata?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sources: Source[];
  /** Display metadata for a file attached to a user message (name only — content is never persisted). */
  attachment?: { name: string };
}

/** A file attached to a chat question. Text files carry `content`; PDFs carry `base64`. */
export interface AttachmentPayload {
  name: string;
  type: string;
  content?: string;
  base64?: string;
}