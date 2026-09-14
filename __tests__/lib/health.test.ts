/**
 * Tests for lib/health.ts — report building and status logic.
 */
import { buildHealthReport, type HealthReport } from "@/lib/health";

describe("buildHealthReport", () => {
  it("reports ok/200 when the Neo4j probe resolves", async () => {
    const { report, httpStatus } = await buildHealthReport(async () => {}, 1_000);

    expect(httpStatus).toBe(200);
    expect(report.status).toBe("ok");
    expect(report.checks).toEqual({ server: "ok", neo4j: "ok" });
  });

  it("reports degraded/503 when the Neo4j probe rejects", async () => {
    const { report, httpStatus } = await buildHealthReport(
      async () => {
        throw new Error("connection refused");
      },
      1_000
    );

    expect(httpStatus).toBe(503);
    expect(report.status).toBe("degraded");
    expect(report.checks).toEqual({ server: "ok", neo4j: "unreachable" });
  });

  it("computes uptime from the provided start time", async () => {
    const startedAt = Date.now() - 65_000; // ~65s ago
    const { report } = await buildHealthReport(async () => {}, startedAt);

    expect(report.uptime_seconds).toBeGreaterThanOrEqual(64);
    expect(report.uptime_seconds).toBeLessThan(70);
  });

  it("always includes an ISO timestamp", async () => {
    const { report } = await buildHealthReport(async () => {}, 1_000);
    expect(() => new Date((report as HealthReport).timestamp)).not.toThrow();
    expect(new Date(report.timestamp).toISOString()).toBe(report.timestamp);
  });
});
