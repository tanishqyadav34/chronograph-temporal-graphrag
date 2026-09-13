// Lightweight, dependency-free extractor that turns an attached dataset
// document into knowledge-graph nodes/links and a timeline, in the same shape
// as lib/mockGraph.ts. It is a heuristic parser, not a full NLP pipeline —
// good enough to make the right panel adapt to the attached file.
//
// Two passes:
//  1. STRUCTURED — recognizes [SLACK-n] / [JIRA-n] / [GIT-n] records (the
//     Meridian Systems dataset format) with full semantics (advocated for /
//     argued against / assigned to / resolved / committed code / ...).
//  2. GENERIC — if the structured pass finds nothing (plain prose, logs,
//     ticket lists, JSON-ish exports, etc.), it falls back to a
//     line-by-line co-occurrence extractor: capitalized multi-word names →
//     people, ticket IDs (CLOUD-101) → tickets, the tech vocabulary → tech
//     nodes, and dated lines → timeline events. This guarantees the graph
//     adapts to virtually any text file.

export interface ParsedNode {
  id: string;
  label: string;
  type: "person" | "technology" | "ticket";
  color: string;
  detail?: string;
}

export interface ParsedLink {
  source: string;
  target: string;
  label: string;
  sourceId: string;
}

export interface ParsedEvent {
  id: string;
  date: string; // "Jan 5"
  title: string;
  reference: string;
  referenceType: "slack" | "github" | "jira";
  sourceId: string;
  /** Raw ISO date (yyyy-mm-dd) used for chronological sorting only. */
  iso?: string;
}

export interface ParsedDataset {
  nodes: ParsedNode[];
  links: ParsedLink[];
  timeline: ParsedEvent[];
}

const PERSON_COLOR = "#0d9488";
const TECH_COLOR = "#6366f1";
const TICKET_COLOR = "#818cf8";

// Known technology vocabulary — matched case-insensitively (exact phrase).
// Multi-word entries come first so "Cloud SQL" wins over "SQL" etc.
// NOTE: deliberately NO `g` flag — `RegExp.test()` with `g` is stateful
// (lastIndex persists between calls) and would miss matches across messages.
const TECH_KEYWORDS: Array<[RegExp, string]> = [
  [/amazon rds|aws rds|\brds\b/i, "RDS"],
  [/cloud sql/i, "Cloud SQL"],
  [/postgres(ql)?/i, "PostgreSQL"],
  [/bigquery/i, "BigQuery"],
  [/\bredshift\b/i, "Redshift"],
  [/cloud storage|\bgcs\b/i, "Cloud Storage"],
  [/\bgcp\b/i, "GCP"],
  [/\baws\b/i, "AWS"],
  [/\bgke\b/i, "GKE"],
  [/terraform/i, "Terraform"],
  [/\biam\b/i, "IAM"],
  [/kubernetes|\bk8s\b/i, "Kubernetes"],
  [/\bs3\b/i, "S3"],
  [/\bec2\b/i, "EC2"],
  [/\blambda\b/i, "Lambda"],
  [/cloudformation/i, "CloudFormation"],
  [/cloud run/i, "Cloud Run"],
  [/bigtable/i, "Bigtable"],
  [/spanner/i, "Spanner"],
  [/dataflow/i, "Dataflow"],
  [/\bpub\/sub\b/i, "Pub/Sub"],
  [/\bvpc\b/i, "VPC"],
  [/docker/i, "Docker"],
  [/\bazure\b/i, "Azure"],
  [/\bsnowflake\b/i, "Snowflake"],
  [/github actions/i, "GitHub Actions"],
];

const POSITIVE = [
  "recommend", "advocate", "support", "approve", "comfortable", "great",
  "better", "worth", "should", "agree", "successful", "complete", "met",
  "encourage", "prefer", "excellent", "good", "promising", "encouraging",
  "happy", "worked", "pass", "passed",
];

const NEGATIVE = [
  "oppose", "opposed", "against", "concern", "risk", "worried", "avoid",
  "downtime", "unsure", "problem", "issue", "harder", "longer", "blocker",
  "fail", "failed", "cannot", "can't", "won't", "should not", "do not",
  "does not", "resist", "argue", "argued", "arguing", "object", "high-risk",
  "unreliable", "not recommend",
];

interface RawRecord {
  kind: "SLACK" | "JIRA" | "GIT";
  num: string;
  text: string;
}

function splitRecords(text: string): RawRecord[] {
  const records: RawRecord[] = [];
  let current: RawRecord | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const m = /^\s*\[(SLACK|JIRA|GIT)-(\d+)\]\s*(.*)$/i.exec(rawLine);
    if (m) {
      if (current) records.push(current);
      current = { kind: m[1].toUpperCase() as RawRecord["kind"], num: m[2], text: rawLine.trim() };
    } else if (current) {
      current.text += "\n" + rawLine.trim();
    }
  }
  if (current) records.push(current);
  return records.slice(0, 400);
}

function pick(pattern: RegExp, text: string): string | null {
  const m = pattern.exec(text);
  return m && m[1] ? m[1].trim() : null;
}

/** Capitalized person name, stopping before the next field label. */
const PERSON_RE =
  /([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*?)(?=\s+(?:Channel|Message|Title|Status|Assignee|Description|Created|Related work|Details|Commit|Reporter)\b|\s*$)/;

function findTech(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const [re, label] of TECH_KEYWORDS) {
    if (re.test(text)) found.push(label);
    if (found.length >= 5) break;
  }
  return found;
}

function classifySentiment(text: string): "advocated for" | "argued against" | "mentioned" {
  const t = text.toLowerCase();
  // Word-boundary matching avoids false hits like "against" in "compared
  // against" and keeps multi-word phrases ("should not") intact.
  const has = (word: string) => new RegExp(`\\b${word}\\b`, "i").test(t);
  if (t.includes("compared against")) {
    // neutral comparison — not an argument
  } else if (NEGATIVE.some(has)) return "argued against";
  if (POSITIVE.some(has)) return "advocated for";
  return "mentioned";
}

function truncate(s: string, max: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const day = parseInt(m[3], 10);
  return `${MONTHS[parseInt(m[2], 10) - 1]} ${day}`;
}

/** Convert a "MonthName dd, yyyy" / "Mon dd, yyyy" date to ISO. */
function monthNameToIso(dateStr: string): string | null {
  const m = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i.exec(dateStr);
  if (!m) return null;
  const month = MONTHS.findIndex((x) => x.toLowerCase() === m[1].slice(0, 3).toLowerCase()) + 1;
  if (!month) return null;
  const day = parseInt(m[2], 10);
  const year = m[3];
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// --------------------------- GENERIC FALLBACK ------------------------------

/** Words that can appear capitalized mid-sentence but are almost never names. */
const NAME_STOPWORDS = new Set([
  "the", "this", "that", "with", "from", "into", "part", "page", "chapter",
  "section", "appendix", "note", "title", "date", "author", "message",
  "channel", "status", "assignee", "reporter", "description", "created",
  "related", "details", "commit", "ticket", "scenario", "fictional",
  "enterprise", "systems", "dataset", "graph", "knowledge", "data", "source",
  "database", "migration", "migrate", "plan", "review", "project",
  "infrastructure", "operations", "workload", "reporting", "production",
  "staging", "development", "platform", "security", "team", "phase",
  "january", "february", "march", "april", "june", "july", "august",
  "september", "october", "november", "december", "monday", "tuesday",
  "wednesday", "thursday", "friday", "saturday", "sunday",
]);

/** True when the phrase (or any word in it) is clearly not a person name. */
function isLikelyPerson(name: string): boolean {
  const words = name.split(/\s+/);
  if (words.some((w) => NAME_STOPWORDS.has(w.toLowerCase()))) return false;
  // A name whose words match the tech vocabulary is a tech phrase, not a person.
  if (TECH_KEYWORDS.some(([re]) => re.test(name))) return false;
  // Real people have at least one lowercase-containing word (e.g. "Priya"),
  // and are usually 2-3 words. All-caps token blocks are codes/headers.
  if (words.some((w) => w === w.toUpperCase() && w.length > 1)) return false;
  return words.length >= 2 && words.length <= 3;
}

/** Generic line-by-line co-occurrence extractor for arbitrary text files. */
function parseGenericText(text: string): ParsedDataset {
  const nodes = new Map<string, ParsedNode>();
  const links: ParsedLink[] = [];
  const timeline: ParsedEvent[] = [];
  let evt = 0;

  const ensureNode = (
    type: ParsedNode["type"],
    id: string,
    label: string,
    detail?: string
  ): string => {
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        label,
        type,
        color: type === "person" ? PERSON_COLOR : type === "technology" ? TECH_COLOR : TICKET_COLOR,
        detail,
      });
    }
    return id;
  };

  const addLink = (source: string, target: string, label: string, sourceId: string) => {
    links.push({ source, target, label, sourceId });
  };

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length && i < 500; i++) {
    const line = lines[i].trim();
    if (!line || line.length < 3) continue;
    const sourceId = `line-${i + 1}`;

    // People: 2-3 word capitalized names (e.g. "Priya Sharma").
    const people = new Set<string>();
    const nameRe = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,2})\b/g;
    let m: RegExpExecArray | null;
    while ((m = nameRe.exec(line))) {
      const name = m[1].trim();
      if (isLikelyPerson(name)) people.add(name);
    }

    // Tickets: project-style IDs (CLOUD-101, CHRONO-109, JIRA-7).
    const tickets = new Set<string>();
    const ticketRe = /\b([A-Z]{2,}[A-Z0-9]*-[0-9]{1,4})\b/g;
    while ((m = ticketRe.exec(line))) {
      const id = m[1];
      // "PART-1" style section headers aren't tickets.
      if (!/^(PART|CHAPTER|SECTION|APPENDIX|FIGURE|TABLE|PAGE)-/i.test(id)) tickets.add(id);
    }

    // Tech vocabulary.
    const techs = findTech(line);

    // Dates: ISO or "Jan 5, 2023" / "January 5, 2023".
    const isoDate = pick(/\(?(\d{4}-\d{2}-\d{2})\)?/, line);
    // Grab the FULL date match (not just the month group) for month-name dates.
    const monthDateMatch =
      /\(?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\)?/i.exec(
        line
      );
    const monthDate = monthDateMatch ? monthDateMatch[0].trim() : null;
    const dateStr = isoDate ? fmtDate(isoDate) : monthDate ? fmtDate(monthNameToIso(monthDate)) : "";
    const iso = isoDate ?? (monthDate ? monthNameToIso(monthDate) : undefined);

    const personIds = Array.from(people).map((p) => ensureNode("person", `person:${p}`, p));
    const ticketIds = Array.from(tickets).map((t) => ensureNode("ticket", `ticket:${t}`, t));
    const techIds = techs.map((t) => ensureNode("technology", `tech:${t}`, t));

    // Co-occurrence links: person ↔ tech / person ↔ ticket / ticket ↔ tech.
    for (const pid of personIds) {
      for (const tid of techIds) addLink(pid, tid, "mentioned", sourceId);
      for (const tkid of ticketIds) addLink(pid, tkid, "mentioned", sourceId);
    }
    for (const tkid of ticketIds) {
      for (const tid of techIds) addLink(tkid, tid, "mentions", sourceId);
    }

    // Timeline: only dated lines become events.
    if (dateStr) {
      const reference =
        people.size > 0
          ? Array.from(people)[0]
          : tickets.size > 0
          ? Array.from(tickets)[0]
          : "document";
      timeline.push({
        id: `evt-${++evt}`,
        date: dateStr,
        title: truncate(line.replace(/^[\s\d:,\-–—]+(?=[A-Za-z])/, ""), 90) || truncate(line, 90),
        reference,
        referenceType: tickets.size > 0 ? "jira" : techs.length > 0 ? "github" : "slack",
        sourceId,
        iso: iso ?? undefined,
      });
    }
  }

  timeline.sort((a, b) => (a.iso ?? "9999-99-99").localeCompare(b.iso ?? "9999-99-99"));

  return {
    nodes: Array.from(nodes.values()),
    links,
    timeline: timeline
      .slice(0, 80)
      .map(({ iso: _iso, ...event }) => event as ParsedEvent),
  };
}

// ------------------------------ ENTRY POINT ---------------------------------

export function parseDatasetText(text: string): ParsedDataset {
  const structured = parseStructured(text);

  // Structured format wins when it found a real graph; otherwise fall back to
  // the generic extractor so the panel adapts to ANY text file.
  if (structured.nodes.length >= 2 && structured.links.length > 0) {
    return structured;
  }
  return parseGenericText(text);
}

function parseStructured(text: string): ParsedDataset {
  const nodes = new Map<string, ParsedNode>();
  const links: ParsedLink[] = [];
  const timeline: ParsedEvent[] = [];

  const ensureNode = (
    type: ParsedNode["type"],
    id: string,
    label: string,
    detail?: string
  ): string => {
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        label,
        type,
        color: type === "person" ? PERSON_COLOR : type === "technology" ? TECH_COLOR : TICKET_COLOR,
        detail,
      });
    }
    return id;
  };

  const addLink = (source: string, target: string, label: string, sourceId: string) => {
    links.push({ source, target, label, sourceId });
  };

  let evt = 0;
  for (const rec of splitRecords(text)) {
    const sourceId = `[${rec.kind}-${rec.num}]`;

    if (rec.kind === "SLACK") {
      const date = pick(/Date:\s*(\d{4}-\d{2}-\d{2})/, rec.text);
      const author = pick(new RegExp(`Author:\\s*${PERSON_RE.source}`), rec.text);
      const message = pick(/Message:\s*([\s\S]+)$/, rec.text);
      if (!author || !message) continue;

      const personId = ensureNode("person", `person:${author}`, author);
      const stance = classifySentiment(message);
      for (const tech of findTech(message)) {
        const techId = ensureNode("technology", `tech:${tech}`, tech);
        addLink(personId, techId, stance, sourceId);
      }
      timeline.push({
        id: `evt-${++evt}`,
        date: fmtDate(date),
        title: truncate(message, 90),
        reference: author,
        referenceType: "slack",
        sourceId,
        iso: date ?? undefined,
      });
    }

    if (rec.kind === "JIRA") {
      const ticketId = pick(/Ticket:\s*([A-Za-z][A-Za-z0-9]*-[0-9]+)/, rec.text);
      const created = pick(/Created:\s*(\d{4}-\d{2}-\d{2})/, rec.text);
      const reporter = pick(new RegExp(`Reporter:\\s*${PERSON_RE.source}`), rec.text);
      const title = pick(/Title:\s*(.+?)(?=\s+Status\b)/, rec.text);
      const status = pick(/Status:\s*(\w+)/, rec.text);
      const assignee = pick(new RegExp(`Assignee:\\s*${PERSON_RE.source}`), rec.text);
      const description = pick(/Description:\s*([\s\S]+)$/, rec.text);
      if (!ticketId || !title) continue;

      const ticketNode = ensureNode("ticket", `ticket:${ticketId}`, ticketId, truncate(title, 60));
      const techs = findTech(`${title} ${description ?? ""}`);
      for (const tech of techs) {
        const techId = ensureNode("technology", `tech:${tech}`, tech);
        addLink(ticketNode, techId, "mentions", sourceId);
      }
      if (assignee) {
        const personId = ensureNode("person", `person:${assignee}`, assignee);
        addLink(personId, ticketNode, "assigned to", sourceId);
        const done = /^(done|completed|resolved|closed)$/i.test(status ?? "");
        if (done) addLink(personId, ticketNode, "resolved", sourceId);
      }
      if (reporter) {
        const personId = ensureNode("person", `person:${reporter}`, reporter);
        addLink(personId, ticketNode, "reported", sourceId);
      }
      timeline.push({
        id: `evt-${++evt}`,
        date: fmtDate(created),
        title: truncate(title, 90),
        reference: ticketId,
        referenceType: "jira",
        sourceId,
        iso: created ?? undefined,
      });
    }

    if (rec.kind === "GIT") {
      const date = pick(/Date:\s*(\d{4}-\d{2}-\d{2})/, rec.text);
      const author = pick(new RegExp(`Author:\\s*${PERSON_RE.source}`), rec.text);
      const commit = pick(/Commit:\s*(.+?)(?=\s+Related work\b|\s+Details\b|\s*$)/, rec.text);
      const related = pick(/Related work:\s*([A-Za-z][A-Za-z0-9]*-[0-9]+)/, rec.text);
      const details = pick(/Details:\s*([\s\S]+)$/, rec.text);
      if (!author || !commit) continue;

      const personId = ensureNode("person", `person:${author}`, author);
      for (const tech of findTech(`${commit} ${details ?? ""}`)) {
        const techId = ensureNode("technology", `tech:${tech}`, tech);
        addLink(personId, techId, "committed code", sourceId);
      }
      if (related) {
        const ticketNode = ensureNode("ticket", `ticket:${related}`, related);
        addLink(personId, ticketNode, "mentioned", sourceId);
      }
      timeline.push({
        id: `evt-${++evt}`,
        date: fmtDate(date),
        title: truncate(commit, 90),
        reference: author,
        referenceType: "github",
        sourceId,
        iso: date ?? undefined,
      });
    }
  }

  // Chronological timeline (undated events last), by raw ISO date.
  timeline.sort((a, b) =>
    (a.iso ?? "9999-99-99").localeCompare(b.iso ?? "9999-99-99")
  );

  return {
    nodes: Array.from(nodes.values()),
    links,
    timeline: timeline
      .slice(0, 80)
      .map(({ iso: _iso, ...event }) => event as ParsedEvent),
  };
}
