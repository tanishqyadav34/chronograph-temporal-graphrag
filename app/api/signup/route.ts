import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { runQuery } from "@/lib/neo4j";
import { SignupRequestSchema, parseBody } from "@/lib/validation";
import { logger } from "@/lib/logger";

const log = logger("chrono-auth");

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Schema-validated request boundary — malformed input is rejected with 400
    // before any handler logic runs.
    const body = await req.json().catch(() => null);
    const parsed = parseBody(SignupRequestSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.errors[0] }, { status: 400 });
    }
    const { name, email, password } = parsed.data;

    const passwordHash = await bcrypt.hash(password, 10);
    const createdAt = new Date().toISOString();

    // Atomic create: MERGE prevents duplicate :User nodes even if two
    // signups race. If the node already existed, createdAt is the OLD value
    // (we only set it ON CREATE) and the account is reported as taken.
    const result = await runQuery(
      `MERGE (u:User { email: $email })
       ON CREATE SET u.name = $name, u.role = $role,
                     u.passwordHash = $hash, u.createdAt = $createdAt
       RETURN u.email AS email, u.createdAt AS createdAt`,
      { email, name, role: "Analyst", hash: passwordHash, createdAt }
    );
    if (result[0]?.createdAt !== createdAt) {
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 409 }
      );
    }

    log.info(`new user created`, { email });
    return NextResponse.json({ ok: true, email }, { status: 201 });
  } catch (err) {
    log.error("signup failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Signup failed. Please try again." }, { status: 500 });
  }
}
