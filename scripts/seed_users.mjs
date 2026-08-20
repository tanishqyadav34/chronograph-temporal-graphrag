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

const uri = process.env.NEO4J_URI ?? "bolt://localhost:7687";
const user = process.env.NEO4J_USER ?? "neo4j";
const password = process.env.NEO4J_PASSWORD;
const database = process.env.NEO4J_DATABASE ?? "neo4j";

if (!password) {
  console.error(
    "NEO4J_PASSWORD is not set. Run with: node --env-file=.env scripts/seed_users.mjs"
  );
  process.exit(1);
}

// ── Demo accounts (change freely) ───────────────────────────────────────────
const USERS = [
  {
    email: "alex.stevens@chronograph.dev",
    password: "demo1234",
    name: "Alex Stevens",
    role: "Senior Security Engineer",
  },
  {
    email: "priya.sharma@meridian.io",
    password: "demo1234",
    name: "Priya Sharma",
    role: "Cloud Strategy Lead",
  },
];

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
const session = driver.session({ database });

try {
  await session.run("RETURN 1 AS ok"); // connectivity check
  console.log(`Connected to Neo4j at ${uri} (database: ${database})`);

  for (const u of USERS) {
    const passwordHash = await hash(u.password, 10);
    const result = await session.run(
      `MERGE (user:User {email: $email})
       SET user.name = $name, user.role = $role, user.passwordHash = $hash
       RETURN user.email AS email, user.name AS name, user.role AS role`,
      { email: u.email, name: u.name, role: u.role, hash: passwordHash }
    );
    const row = result.records[0]?.toObject() ?? {};
    console.log(
      `✔ upserted ${row.email} (${row.name}, ${row.role})` +
        ` — password: ${u.password}`
    );
  }
} catch (err) {
  console.error("Seeding failed:", err.message ?? err);
  process.exitCode = 1;
} finally {
  await session.close();
  await driver.close();
}
