import { NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import { buildHealthReport } from "@/lib/health";

/**
 * GET /api/health — liveness/readiness probe.
 *
 * 200 { status: "ok", checks: { server: "ok", neo4j: "ok" } }
 * 503 { status: "degraded", checks: { neo4j: "unreachable" } }
 *
 * Always answers quickly: the Neo4j round-trip is bounded by a timer race.
 */
export async function GET() {
  const startedAt = Date.now() - process.uptime() * 1000;

  const { report, httpStatus } = await buildHealthReport(async () => {
    await Promise.race([
      runQuery("RETURN 1 AS ok"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("neo4j probe timeout")), 2000)
      ),
    ]);
  }, startedAt);

  return NextResponse.json(report, { status: httpStatus });
}
