/**
 * Tests for lib/logger.ts — pino-backed structured JSON logging with level
 * filtering and scope bindings.
 */
import { logger, setLogLevel } from "@/lib/logger";

function captureStdout(): { lines: () => string[]; restore: () => void } {
  const chunks: string[] = [];
  const original = process.stdout.write;
  process.stdout.write = ((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  return {
    lines: () => chunks.join("").split("\n").filter(Boolean),
    restore: () => {
      process.stdout.write = original;
    },
  };
}

describe("logger", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    setLogLevel("info");
  });

  it("emits a single JSON line with level/msg/scope/time", () => {
    const cap = captureStdout();
    cleanup = cap.restore;

    const log = logger("test-scope");
    log.info("hello world");

    const lines = cap.lines();
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("hello world");
    expect(parsed.scope).toBe("test-scope");
    // pino's isoTime formatter emits an ISO-8601 string timestamp
    expect(typeof parsed.time).toBe("string");
    expect(new Date(parsed.time).toISOString()).toBe(parsed.time);
  });

  it("routes each level through the same stream", () => {
    const cap = captureStdout();
    cleanup = cap.restore;

    const log = logger();
    log.error("boom");
    log.warn("careful");
    log.info("fine");

    const levels = cap.lines().map((l) => JSON.parse(l).level);
    expect(levels).toEqual(["error", "warn", "info"]);
    expect(cap.lines()[0]).toContain('"level":"error"');
    expect(cap.lines()[1]).toContain('"level":"warn"');
  });

  it("filters below the configured level", () => {
    setLogLevel("warn");
    const cap = captureStdout();
    cleanup = cap.restore;

    const log = logger("x");
    log.debug("nope");
    log.info("nope");
    log.warn("yes");
    log.error("yes");

    const levels = cap.lines().map((l) => JSON.parse(l).level);
    expect(levels).toEqual(["warn", "error"]);
  });

  it("supports pino-style object + message logging", () => {
    const cap = captureStdout();
    cleanup = cap.restore;

    const log = logger("m");
    log.warn("with meta", { rows: 3 });

    const parsed = JSON.parse(cap.lines()[0]);
    expect(parsed.msg).toBe("with meta");
    expect(parsed.rows).toBe(3);
  });
});
