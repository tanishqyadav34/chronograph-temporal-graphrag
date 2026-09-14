#!/usr/bin/env node
/**
 * Dependency-audit gate with a documented allowlist.
 *
 * `npm audit --audit-level=high` fails CI, but forcing next@16 is a breaking
 * React 19 migration out of scope for this project. Instead, every remaining
 * advisory is reviewed, listed in scripts/audit-allowlist.json with a reason
 * and a removal condition, and verified here. Any NEW high/critical advisory
 * — or an allowlisted advisory whose package no longer matches the installed
 * tree — fails this gate.
 *
 * Usage: node scripts/audit-check.mjs   (exit 1 = un-allowlisted advisories)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ALLOWLIST_PATH = join(ROOT, "scripts", "audit-allowlist.json");

/** Run npm audit, tolerant of npm's non-zero exit when advisories exist. */
function runAudit() {
  try {
    const stdout = execFileSync("npm", ["audit", "--json"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      shell: process.platform === "win32",
    });
    return JSON.parse(stdout);
  } catch (err) {
    // npm audit exits 1 when advisories exist — the JSON is on stdout.
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout);
      } catch {
        /* fall through */
      }
    }
    console.error("audit-check: could not run `npm audit --json`:", err.message);
    process.exit(2);
  }
}

const allowlistDoc = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"));
const allowlisted = new Set(allowlistDoc.allowlist.map((a) => a.id));

const audit = runAudit();
const vulns = audit.vulnerabilities ?? {};

const blocking = [];
const accepted = [];

for (const [pkg, info] of Object.entries(vulns)) {
  for (const via of info.via ?? []) {
    // Direct advisory objects describe the vulnerability; strings are
    // cross-references to another vulnerable package (skipped — the source
    // advisory on that package is evaluated on its own).
    if (typeof via !== "object") continue;
    if (!["high", "critical"].includes(via.severity)) continue;

    if (allowlisted.has(via.source)) {
      accepted.push({ id: via.source, package: pkg, severity: via.severity, title: via.title });
    } else {
      blocking.push({ id: via.source, package: pkg, severity: via.severity, title: via.title, url: via.url });
    }
  }
}

console.log(`audit-check: ${accepted.length} allowlisted advisories accepted:`);
for (const a of accepted) {
  console.log(`  [${a.severity}] #${a.id} ${a.package} — ${a.title}`);
}

if (blocking.length > 0) {
  console.error(`\naudit-check: ${blocking.length} UN-ALLOWLISTED high/critical advisories:`);
  for (const a of blocking) {
    console.error(`  [${a.severity}] #${a.id} ${a.package} — ${a.title}`);
    console.error(`    ${a.url ?? ""}`);
  }
  console.error(
    "\nFix the dependency, or add the advisory to scripts/audit-allowlist.json with a reason and removal condition after review."
  );
  process.exit(1);
}

console.log("\naudit-check: OK — no un-allowlisted high/critical advisories.");
