/**
 * datasetRecords.ts
 *
 * Loader for data/mock_dataset.json and platform mapping shared by the chat
 * pipeline. Extracted from app/api/chat/route.ts so it can be unit-tested
 * without Next.js.
 */
import { readFileSync } from "fs";
import path from "path";

export interface DatasetRecord {
  source_id: string;
  source_type: "slack" | "git" | "jira";
  author: string;
  content: string;
  timestamp: string;
}

export type PlainRecord = Record<string, unknown>;

/** Only used to enrich source cards (title / excerpt / platform). */
const DATASET_PATH = path.join(process.cwd(), "data", "mock_dataset.json");

export function loadRecordMap(): Map<string, DatasetRecord> {
  const records = JSON.parse(readFileSync(DATASET_PATH, "utf-8")) as DatasetRecord[];
  return new Map(records.map((r) => [r.source_id, r]));
}

/** Map a dataset source_type to the frontend platform union (git → github). */
export function toPlatform(sourceType: DatasetRecord["source_type"]): "slack" | "github" | "jira" {
  if (sourceType === "git") return "github";
  return sourceType;
}
