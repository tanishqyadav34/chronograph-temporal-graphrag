import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { runQuery } from "@/lib/neo4j";

// ── Validation ───────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }
    if (name.length > 80) {
      return NextResponse.json({ error: "Name is too long." }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 }
      );
    }
    if (password.length > 200) {
      return NextResponse.json({ error: "Password is too long." }, { status: 400 });
    }

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

    console.log(`[chrono-auth] new user created: ${email}`);
    return NextResponse.json({ ok: true, email }, { status: 201 });
  } catch (err) {
    console.error("[chrono-auth] signup failed:", err);
    return NextResponse.json({ error: "Signup failed. Please try again." }, { status: 500 });
  }
}
