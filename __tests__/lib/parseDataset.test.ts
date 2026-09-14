/**
 * Tests for lib/parseDataset.ts — structured SLACK/JIRA/GIT parsing, the
 * generic fallback extractor, and the sentiment/date helpers behind them.
 */
import { parseDatasetText } from "@/lib/parseDataset";

const slackRecord = (overrides: Partial<Record<string, string>> = {}) =>
  [
    "[SLACK-1] Channel: eng-migration",
    `Date: ${overrides.date ?? "2024-01-05"}`,
    `Author: ${overrides.author ?? "Alice Smith"}`,
    `Message: ${overrides.message ?? "I recommend GCP for the migration."}`,
  ].join("\n");

describe("parseStructured (SLACK)", () => {
  it("creates person + technology nodes with a sentiment link", () => {
    const { nodes, links } = parseDatasetText(slackRecord());

    const person = nodes.find((n) => n.id === "person:Alice Smith");
    const tech = nodes.find((n) => n.id === "tech:GCP");
    expect(person).toMatchObject({ label: "Alice Smith", type: "person" });
    expect(tech).toMatchObject({ label: "GCP", type: "technology" });

    expect(links).toContainEqual(
      expect.objectContaining({
        source: "person:Alice Smith",
        target: "tech:GCP",
        label: "advocated for",
        sourceId: "[SLACK-1]",
      })
    );
  });

  it("classifies negative sentiment as argued against", () => {
    const { links } = parseDatasetText(
      slackRecord({ message: "I am worried about RDS downtime and this is risky." })
    );
    expect(links.some((l) => l.label === "argued against")).toBe(true);
  });

  it("never argues from 'compared against', even with other negative words", () => {
    const { links } = parseDatasetText(
      slackRecord({ message: "We compared against Redshift and it worked fine, good results." })
    );
    const link = links.find((l) => l.target === "tech:Redshift");
    // The neutral-comparison guard skips the negative scan; positive words
    // still advocate.
    expect(link?.label).toBe("advocated for");
  });

  it("skips SLACK records without an author or message (generic fallback takes over)", () => {
    const parsed = parseDatasetText("[SLACK-2] Date: 2024-01-06 Channel: eng");
    // Structured parsing produced nothing, so dispatch fell back to the
    // generic extractor — which sees "SLACK-2" as a ticket-like ID.
    expect(parsed.links).toHaveLength(0);
    expect(parsed.nodes.map((n) => n.id)).toEqual(["ticket:SLACK-2"]);
  });
});

describe("parseStructured (JIRA)", () => {
  const jira = [
    "[JIRA-7] Project: Migration",
    "Created: 2024-02-10",
    "Ticket: CHRONO-205",
    "Title: Assess Database Migration Risk from RDS",
    "Status: Done",
    "Assignee: Priya Sharma",
    "Reporter: Bob Jones",
    "Description: Move PostgreSQL to Cloud SQL",
  ].join("\n");

  it("creates a ticket node with the title as detail", () => {
    const { nodes } = parseDatasetText(jira);
    const ticket = nodes.find((n) => n.id === "ticket:CHRONO-205");
    expect(ticket).toMatchObject({ type: "ticket", detail: "Assess Database Migration Risk from RDS" });
  });

  it("links assignee with assigned-to and resolved, reporter with reported", () => {
    const { links } = parseDatasetText(jira);
    expect(links).toContainEqual(
      expect.objectContaining({ source: "person:Priya Sharma", target: "ticket:CHRONO-205", label: "assigned to" })
    );
    expect(links).toContainEqual(
      expect.objectContaining({ source: "person:Priya Sharma", label: "resolved" })
    );
    expect(links).toContainEqual(
      expect.objectContaining({ source: "person:Bob Jones", target: "ticket:CHRONO-205", label: "reported" })
    );
  });

  it("links the ticket to technologies found in title/description", () => {
    const { links } = parseDatasetText(jira);
    expect(links).toContainEqual(
      expect.objectContaining({ source: "ticket:CHRONO-205", target: "tech:PostgreSQL", label: "mentions" })
    );
  });

  it("does not add a resolved link when status is open", () => {
    const { links } = parseDatasetText(jira.replace("Status: Done", "Status: Open"));
    expect(links.some((l) => l.label === "resolved")).toBe(false);
  });
});

describe("parseStructured (GIT)", () => {
  const git = [
    "[GIT-3] Repo: chronograph",
    "Date: 2024-03-02",
    "Author: Dave Miller",
    "Commit: Configure Terraform for GKE",
    "Related work: CHRONO-210",
    "Details: Added IAM bindings for Kubernetes",
  ].join("\n");

  it("creates committed-code links and a related-ticket mention", () => {
    const { nodes, links } = parseDatasetText(git);
    expect(nodes.map((n) => n.id)).toEqual(
      expect.arrayContaining(["person:Dave Miller", "tech:Terraform", "tech:GKE", "ticket:CHRONO-210"])
    );
    expect(links).toContainEqual(
      expect.objectContaining({ source: "person:Dave Miller", target: "tech:Terraform", label: "committed code" })
    );
    expect(links).toContainEqual(
      expect.objectContaining({ source: "person:Dave Miller", target: "ticket:CHRONO-210", label: "mentioned" })
    );
  });
});

describe("parseGenericText fallback", () => {
  it("extracts people, tickets and tech from plain prose", () => {
    const text =
      "Priya Sharma reviewed CHRONO-109 about PostgreSQL on 2024-02-01 and had concerns about downtime.";
    const { nodes, links, timeline } = parseDatasetText(text);

    expect(nodes.map((n) => n.id)).toEqual(
      expect.arrayContaining(["person:Priya Sharma", "ticket:CHRONO-109", "tech:PostgreSQL"])
    );
    expect(links.some((l) => l.source === "person:Priya Sharma" && l.target === "ticket:CHRONO-109")).toBe(true);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ date: "Feb 1", reference: "Priya Sharma", referenceType: "jira" });
  });

  it("sorts dated timeline events chronologically and strips the internal iso field", () => {
    const text = [
      "Alice Brown started S3 cleanup on 2024-03-05.",
      "Bob Cohen filed CHRONO-2 on 2024-01-15.",
    ].join("\n");
    const { timeline } = parseDatasetText(text);
    expect(timeline.map((e) => e.date)).toEqual(["Jan 15", "Mar 5"]);
    expect(timeline[0]).not.toHaveProperty("iso");
  });

  it("supports month-name dates (e.g. 'January 5, 2023')", () => {
    const { timeline } = parseDatasetText("Priya Sharma presented the plan on January 5, 2023.");
    expect(timeline[0]?.date).toBe("Jan 5");
  });

  it("rejects all-caps blocks, stopwords and tech phrases as person names", () => {
    const text = "AWS MIGRATION PLAN for the GCP project was filed by CHRONO-1 on 2024-01-05.";
    const { nodes } = parseDatasetText(text);
    expect(nodes.filter((n) => n.type === "person")).toHaveLength(0);
  });

  it("does not treat PART/CHAPTER-style headers as tickets", () => {
    const text = "PART-1 Introduction written by Dana Reed on 2024-01-05.";
    const { nodes } = parseDatasetText(text);
    expect(nodes.find((n) => n.type === "ticket")).toBeUndefined();
  });
});

describe("parseDatasetText dispatch", () => {
  it("prefers the structured parse when it found a real graph", () => {
    const parsed = parseDatasetText(slackRecord());
    // Structured sourceIds look like "[SLACK-1]", generic ones like "line-N".
    expect(parsed.links.every((l) => l.sourceId.startsWith("[SLACK-"))).toBe(true);
  });

  it("falls back to the generic extractor for unstructured documents", () => {
    const parsed = parseDatasetText("Dana Reed wrote about PostgreSQL on 2024-01-05.");
    expect(parsed.links.every((l) => l.sourceId.startsWith("line-"))).toBe(true);
  });

  it("truncates long timeline titles to 90 chars with an ellipsis", () => {
    const long = "Priya Sharma discussed " + "database ".repeat(30) + "on 2024-01-05.";
    const { timeline } = parseDatasetText(long);
    expect(timeline[0].title.length).toBeLessThanOrEqual(90);
    expect(timeline[0].title.endsWith("…")).toBe(true);
  });
});
