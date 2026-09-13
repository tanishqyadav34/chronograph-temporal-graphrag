/**
 * cypherSafety.ts
 *
 * Guards against executing LLM-generated Cypher that is either destructive or
 * structurally invalid:
 *   1. isSafeReadOnlyCypher()  — rejects mutation keywords (CREATE/DELETE/...).
 *   2. validateCypherStructure() — rejects queries that reference relationship
 *      types / node labels outside the known schema, or that reference
 *      variables in RETURN/WHERE that were never bound in a MATCH pattern.
 */

// Any of these keywords (case-insensitive, whole-word) makes a query unsafe.
const MUTATION_KEYWORDS = ["CREATE", "DELETE", "MERGE", "SET", "REMOVE", "DROP"] as const;

export const ALLOWED_RELATIONSHIP_TYPES = [
  "ADVOCATED_FOR",
  "ARGUED_AGAINST",
  "COMMITTED_CODE",
  "ASSIGNED_TO",
  "RESOLVED",
  "MENTIONED",
] as const;

export const ALLOWED_NODE_LABELS = ["Person", "Technology", "Ticket"] as const;

/**
 * Returns true when the query is safe to execute: non-empty and free of
 * every mutation keyword (matched as whole words, case-insensitive).
 */
export function isSafeReadOnlyCypher(query: string): boolean {
  if (!query || !query.trim()) return false;

  const upper = query.toUpperCase();
  return MUTATION_KEYWORDS.every((keyword) => {
    // \b boundaries so e.g. "SET" doesn't match inside "offset"/"dataset"/"reset".
    const re = new RegExp(`\\b${keyword}\\b`);
    return !re.test(upper);
  });
}

// ── Structural validation ───────────────────────────────────────────────────

/** Remove string literals ('...', "...", `...`) so they can't confuse regex scans. */
function stripLiterals(query: string): string {
  return query
    .replace(/'(?:[^'\\]|\\.)*'/g, " ")
    .replace(/"(?:[^"\\]|\\.)*"/g, " ")
    .replace(/`[^`]*`/g, " ");
}

/** True when the string is a bare Cypher identifier (label or type token). */
function isIdentifier(s: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
}

/** Extract every relationship type used in -[r:TYPE]- patterns (variable-length
 *  suffixes like *1..2 are stripped). Anonymous -[r]- / -[]-> add nothing. */
function extractRelTypes(query: string): string[] {
  const types: string[] = [];
  const relRe = /-\[([^\]]*)\]-/g;
  let m: RegExpExecArray | null;
  while ((m = relRe.exec(query)) !== null) {
    const core = m[1].split("{")[0].trim();
    const colonIdx = core.indexOf(":");
    if (colonIdx < 0) continue;
    core
      .slice(colonIdx + 1)
      .split("|")
      .forEach((t) => {
        const cleaned = t.trim().replace(/\*.*/, "").trim();
        if (cleaned && isIdentifier(cleaned)) types.push(cleaned);
      });
  }
  return types;
}

/** Extract every node label used in (n:Label) patterns. */
function extractNodeLabels(query: string): string[] {
  const labels: string[] = [];
  const nodeRe = /\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = nodeRe.exec(query)) !== null) {
    const core = m[1].split("{")[0].trim();
    const colonIdx = core.indexOf(":");
    if (colonIdx < 0) continue;
    core
      .slice(colonIdx + 1)
      .split(":")
      .forEach((l) => {
        const cleaned = l.trim();
        if (cleaned && isIdentifier(cleaned)) labels.push(cleaned);
      });
  }
  return labels;
}

/** First identifier inside a pattern slot — the variable name, if any. */
function firstIdent(inner: string): string | null {
  const m = inner.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)/);
  return m ? m[1] : null;
}

/** All variables bound anywhere: node/rel pattern variables + `AS` aliases. */
function boundVariables(query: string): Set<string> {
  const vars = new Set<string>();
  const q = stripLiterals(query);

  const nodeRe = /\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = nodeRe.exec(q)) !== null) {
    const id = firstIdent(m[1]);
    if (id) vars.add(id);
  }
  const relRe = /-\[([^\]]*)\]-/g;
  while ((m = relRe.exec(q)) !== null) {
    const id = firstIdent(m[1]);
    if (id) vars.add(id);
  }
  const asRe = /\bAS\s+([A-Za-z_][A-Za-z0-9_]*)\b/gi;
  while ((m = asRe.exec(q)) !== null) vars.add(m[1]);

  return vars;
}

/** Identifiers referenced in a clause (properties after "." and function calls
 *  like count(...) are skipped, as are Cypher keywords). */
function referencedVariables(clause: string): Set<string> {
  const vars = new Set<string>();
  const q = stripLiterals(clause);
  const idRe = /[A-Za-z_][A-Za-z0-9_]*/g;
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(q)) !== null) {
    const token = m[0];
    const start = m.index;
    const prev = q[start - 1];
    const upper = token.toUpperCase();
    if (prev === ".") continue; // property access
    const after = q.slice(start + token.length).trimStart();
    if (after.startsWith("(")) continue; // function call
    if (CYPHER_KEYWORDS.has(upper)) continue;
    vars.add(token);
  }
  return vars;
}

const CYPHER_KEYWORDS = new Set([
  "MATCH", "OPTIONAL", "RETURN", "WHERE", "WITH", "AS", "ORDER", "BY", "LIMIT",
  "SKIP", "DISTINCT", "AND", "OR", "NOT", "IN", "IS", "NULL", "TRUE", "FALSE",
  "CASE", "WHEN", "THEN", "ELSE", "END", "ASC", "DESC", "STARTS", "ENDS",
  "CONTAINS", "EXISTS", "UNWIND", "ON", "UNION", "ALL", "DETACH", "MERGE",
  "CREATE", "DELETE", "SET", "REMOVE", "DROP", "USING", "INDEX", "CALL",
]);

/** Extract the text of RETURN clauses (stopping at the next clause keyword). */
function returnClauses(query: string): string[] {
  return clauseSlices(query, /\bRETURN\b/gi, /\b(MATCH|WITH|WHERE|UNWIND|UNION|ORDER\s+BY|LIMIT|SKIP|RETURN)\b/i);
}

/** Extract the text of WHERE clauses. */
function whereClauses(query: string): string[] {
  return clauseSlices(query, /\bWHERE\b/gi, /\b(RETURN|WITH|MATCH|UNWIND|UNION|ORDER\s+BY|LIMIT|SKIP|WHERE)\b/i);
}

function clauseSlices(query: string, startRe: RegExp, endRe: RegExp): string[] {
  const q = stripLiterals(query);
  const slices: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(q)) !== null) {
    const rest = q.slice(m.index + m[0].length);
    const endIdx = rest.search(endRe);
    slices.push(rest.slice(0, endIdx === -1 ? rest.length : endIdx));
  }
  return slices;
}

export interface CypherValidation {
  ok: boolean;
  errors: string[];
}

/**
 * Pre-flight structural check on an LLM-generated query. Returns ok:false (with
 * human-readable reasons) instead of letting broken Cypher reach Neo4j.
 */
export function validateCypherStructure(query: string): CypherValidation {
  const errors: string[] = [];

  // 1) Relationship types must be in the known schema.
  for (const t of extractRelTypes(query)) {
    if (!(ALLOWED_RELATIONSHIP_TYPES as readonly string[]).includes(t)) {
      errors.push(
        `used undefined relationship type ${t} — only use: ${ALLOWED_RELATIONSHIP_TYPES.join(", ")}`
      );
    }
  }

  // 2) Node labels must be in the known schema.
  for (const l of extractNodeLabels(query)) {
    if (!(ALLOWED_NODE_LABELS as readonly string[]).includes(l)) {
      errors.push(`used undefined node label ${l} — only use: ${ALLOWED_NODE_LABELS.join(", ")}`);
    }
  }

  // 3) Every variable referenced in RETURN / WHERE must be bound in a MATCH pattern.
  const bound = boundVariables(query);
  referencedVariables(returnClauses(query).join(" ")).forEach((varName) => {
    if (!bound.has(varName)) {
      errors.push(`referenced variable ${varName} in a RETURN clause but it is not bound in a MATCH pattern`);
    }
  });
  referencedVariables(whereClauses(query).join(" ")).forEach((varName) => {
    if (!bound.has(varName)) {
      errors.push(`referenced variable ${varName} in a WHERE clause but it is not bound in a MATCH pattern`);
    }
  });

  return { ok: errors.length === 0, errors };
}
