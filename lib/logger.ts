/**
 * logger.ts
 *
 * Structured logging via pino: one JSON object per line (easy to grep/ship),
 * level-filtered via LOG_LEVEL (debug|info|warn|error, default info), with an
 * optional `scope` tag as a child binding so each subsystem can be filtered
 * (e.g. chrono-cypher).
 */
import pino, { type Logger } from "pino";
import { Writable } from "stream";

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Writable that mirrors pino output onto process.stdout (spy-friendly). */
const stdoutDestination = new Writable({
  write(chunk, _encoding, callback) {
    process.stdout.write(chunk);
    callback();
  },
});

const root: Logger = pino(
  {
    level: normalizeLevel(process.env.LOG_LEVEL),
    base: undefined, // omit pid/hostname for lean single-line records
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  },
  stdoutDestination
);

function normalizeLevel(raw: string | undefined): LogLevel {
  const value = (raw ?? "info").toLowerCase();
  return value === "debug" || value === "warn" || value === "error" ? value : "info";
}

/** Re-target the root level at runtime (e.g. from tests or admin tooling). */
export function setLogLevel(level: LogLevel): void {
  root.level = level;
}

/** Message + optional structured-meta log function. */
export type LogFn = (msg: string, meta?: Record<string, unknown>) => void;

/** Create a scoped logger: const log = logger("chrono-cypher"); */
export function logger(scope?: string): {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
} {
  const bound = scope ? root.child({ scope }) : root;
  const make = (level: "debug" | "info" | "warn" | "error"): LogFn =>
    (msg, meta) => {
      // pino convention: (obj, msg) merges obj fields at the record top level
      if (meta === undefined) bound[level](msg);
      else bound[level](meta, msg);
    };
  return { debug: make("debug"), info: make("info"), warn: make("warn"), error: make("error") };
}

export default logger;
