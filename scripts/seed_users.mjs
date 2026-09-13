// Seed demo user accounts into Neo4j as :User nodes.
//
// Run from the project root:
//   npm run seed:users
// (equivalent to: node --env-file=.env scripts/seed_users.mjs)
//
// :User is a completely separate node type from the knowledge graph
// (:Person / :Technology / :Ticket) — accounts never mix into it.

import neo4j from "neo4j-driver";
import { hash } from "bcryptjs";
import { randomBytes } from "crypto";

const uri = process.env.NEO4J_URI ?? "bolt://localhost:7687";
const user = process.env.NEO4J_USER ?? "neo4j";
const password = process.env.NEO4J_PASSWORD;
const database = process.env.NEO4J_DATABASE ?? "neo4j";

// Password for the seeded demo accounts. Set DEMO_USER_PASSWORD to control it;
// otherwise a random password is generated per run and printed once below.
const demoPassword = process.env.DEMO_USER_PASSWORD ?? randomBytes(12).toString("hex");

if (!password) {
  console.error(
    "NEO4J_PASSWORD is not set. Run with: node --env-file=.env scripts/seed_users.mjs"
  );
  process.exit(1);
}

// ── Demo accounts (passwords set via demoPassword above) ──────────────────
const USERS = [
  {
    email: "alex.stevens@chronograph.dev",
    name: "Alex Stevens",
    role: "Senior Security Engineer",
  },
  {
    email: "priya.sharma@meridian.io",
    name: "Priya Sharma",
    role: "Cloud Strategy Lead",
  },
];

if (!process.env.DEMO_USER_PASSWORD) {
  console.log(
    "DEMO_USER_PASSWORD not set — generated a random password for the demo accounts: " +
      demoPassword
  );
}

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
const session = driver.session({ database });

try {
  await session.run("RETURN 1 AS ok"); // connectivity check
  console.log(`Connected to Neo4j at ${uri} (database: ${database})`);

  for (const u of USERS) {
    const passwordHash = await hash(demoPassword, 10);
    const result = await session.run(
      `MERGE (user:User {email: $email})
       SET user.name = $name, user.role = $role, user.passwordHash = $hash
       RETURN user.email AS email, user.name AS name, user.role AS role`,
      { email: u.email, name: u.name, role: u.role, hash: passwordHash }
    );
    const row = result.records[0]?.toObject() ?? {};
    console.log(
      `✔ upserted ${row.email} (${row.name}, ${row.role})` +
        (process.env.DEMO_USER_PASSWORD ? " — password: DEMO_USER_PASSWORD" : " — password: (random, printed above)")
    );
  }
} catch (err) {
  console.error("Seeding failed:", err.message ?? err);
  process.exitCode = 1;
} finally {
  await session.close();
  await driver.close();
}
