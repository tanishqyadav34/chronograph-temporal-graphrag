/**
 * Tests for lib/logger.ts — structured JSON logging with level filtering.
 */
import { logger } from "@/lib/logger";

describe("logger", () => {
  let logSpy: jest.SpyInstance;
  let errSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    delete process.env.LOG_LEVEL;
  });

  it("emits a single JSON line with ts/level/msg and scope", () => {
    const log = logger("test-scope");
    log.info("hello world");

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("hello world");
    expect(parsed.scope).toBe("test-scope");
    expect(typeof parsed.ts).toBe("string");
  });

  it("routes error() to console.error, warn() to console.warn, info() to console.log", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const log = logger();
    log.error("boom");
    log.warn("careful");
    log.info("fine");
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(errSpy.mock.calls[0][0] as string).level).toBe("error");
    expect(JSON.parse(warnSpy.mock.calls[0][0] as string).level).toBe("warn");
    warnSpy.mockRestore();
  });

  it("filters below the configured level", () => {
    process.env.LOG_LEVEL = "warn";
    const log = logger("x");
    log.debug("nope");
    log.info("nope");
    log.warn("yes");
    log.error("yes");
    expect(logSpy).toHaveBeenCalledTimes(0);
    expect(errSpy).toHaveBeenCalledTimes(1);
  });

  it("includes meta as a nested object", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const log = logger("m");
    log.warn("with meta", { rows: 3 });
    const parsed = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(parsed.meta).toEqual({ rows: 3 });
    warnSpy.mockRestore();
  });
});
