/**
 * logger.ts
 *
 * Minimal structured logger: one JSON object per line (easy to grep/ship),
 * level-filtered via LOG_LEVEL (debug|info|warn|error, default info), with an
 * optional `scope` tag so each subsystem can be filtered (e.g. chrono-cypher).
 * Wraps console so no new dependency is introduced.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentLevel(): number {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return LEVELS[(raw as LogLevel) in LEVELS ? (raw as LogLevel) : "info"];
}

function emit(level: LogLevel, scope: string | undefined, message: string, meta?: Record<string, unknown>): void {
  if (LEVELS[level] < currentLevel()) return;

  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg: message,
  };
  if (scope) entry.scope = scope;
  if (meta) entry.meta = meta;

  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Create a scoped logger: const log = logger("chrono-cypher"); */
export function logger(scope?: string) {
  return {
    debug: (msg: string, meta?: Record<string, unknown>) => emit("debug", scope, msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => emit("info", scope, msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", scope, msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => emit("error", scope, msg, meta),
  };
}

export default logger;
