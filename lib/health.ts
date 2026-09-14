/**
 * health.ts
 *
 * Health-check report builder shared by app/api/health/route.ts. The Neo4j
 * probe is injected so the logic is unit-testable without a driver or Next.js.
 */

export type HealthStatus = "ok" | "degraded";

export interface HealthReport {
  status: HealthStatus;
  uptime_seconds: number;
  timestamp: string;
  checks: {
    server: "ok";
    neo4j: "ok" | "unreachable";
  };
}

export interface HealthResult {
  report: HealthReport;
  /** 200 when everything is healthy, 503 when a dependency is unreachable. */
  httpStatus: number;
}

/**
 * Build the health report. `probeNeo4j` should resolve when the database is
 * reachable and reject otherwise (e.g. a `RETURN 1` round-trip).
 */
export async function buildHealthReport(
  probeNeo4j: () => Promise<void>,
  startedAt: number = process.uptime
    ? Date.now() - process.uptime() * 1000
    : Date.now()
): Promise<HealthResult> {
  const neo4jOk = await probeNeo4j()
    .then(() => true)
    .catch(() => false);

  const report: HealthReport = {
    status: neo4jOk ? "ok" : "degraded",
    uptime_seconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
    timestamp: new Date().toISOString(),
    checks: {
      server: "ok",
      neo4j: neo4jOk ? "ok" : "unreachable",
    },
  };

  return { report, httpStatus: neo4jOk ? 200 : 503 };
}
