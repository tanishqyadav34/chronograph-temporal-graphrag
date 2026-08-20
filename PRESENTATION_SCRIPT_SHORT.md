# ChronoGraph — Short Presentation Script (~7 minutes)

> **[SAY]** = words · **[DO]** = actions. The full-length script with the Q&A cheat sheet is in
> `PRESENTATION_SCRIPT.md` if you need depth. Keep this one in front of you.

---

## 1. Opening — Elevator Pitch (40s)

**[SAY]**

> "ChronoGraph is a **Temporal GraphRAG system** — a chat assistant that answers questions
> about your organization's history in plain English, with **timeline-aware, evidence-backed
> answers and citations** back to the original Slack messages, Git commits, and Jira tickets.
>
> The core idea: we don't dump documents into a chatbot. We first **extract the people,
> technologies, and decisions** into a **knowledge graph** where every connection carries a
> **timestamp and a source ID**. You ask a question → the system **writes a graph query from
> it, retrieves the exact relevant facts, and narrates the story** — what happened, when, by
> whom, and where the evidence is."

---

## 2. The Problem (25s)

**[SAY]**

> "Enterprise knowledge lives in silos. Searching Slack, Jira, and Git separately is painful,
> and 'why did we do X?' requires reading months of history. Generic chatbots hallucinate and
> can't cite sources.
>
> ChronoGraph gives three guarantees: **grounded answers** (every claim comes from retrieved
> graph data), **citations** (every answer points to real source records), and **temporal
> awareness** (the timeline is first-class)."

---

## 3. How It Works (90s)

**[SAY]**

> "The system has three stages.
>
> **1. Data layer** — a Python pipeline. We generate a realistic synthetic dataset — 90 Slack,
> Jira, and Git records telling the story of an AWS-to-GCP migration in early 2023. An LLM
> extracts **164 relationship triples**, and a script loads them into **Neo4j**.
>
> The graph schema is deliberately strict: three node types — **Person, Technology, Ticket** —
> and exactly six relationship types, like *advocated for*, *argued against*, *committed code*.
> Every edge has a timestamp and source ID.
>
> **2. Retrieval layer** — the brain. Your question is classified: **simple questions** like
> 'who argued against GCP?' use one graph query. **Synthesis questions** like 'why did we
> migrate?' generate **2–4 independent queries across different relationship types**, run them
> in parallel, merge the results **chronologically**, and let the LLM weave them into one
> narrative.
>
> Crucially, every generated query passes **pre-flight safety validation** — write operations
> and unknown schema are blocked before they ever reach the database, with one automatic
> retry. Broken Cypher never runs.
>
> **3. Presentation layer** — a Next.js app with a chat UI, **source cards** for citations, a
> live **knowledge-graph visualization**, a **timeline**, file attachments, authentication,
> and per-user conversation history."

---

## 4. Live Demo (~3 min)

**[DO]** Open `http://localhost:3000` → login: `alex.stevens@chronograph.dev` / `demo1234`.

**[SAY]**
> "Let me show you the three things that matter most."

### Demo 1 — Grounded Q&A with citations

**[DO]** Ask: **"Who argued against the GCP migration?"** → open **Sources (N)** under the answer.

**[SAY]**
> "The question becomes a read-only graph query, validated, run against Neo4j. The answer
> cites the exact Slack messages — platform, author, timestamp, excerpt. Grounded, not
> generated from thin air."

### Demo 2 — The showstopper: synthesis question

**[DO]** Ask: **"Why did we migrate from AWS to GCP, and what were the main engineering concerns?"**

**[SAY]**
> "No single query can answer this. It's classified as a **synthesis** question: the system
> fires several queries — advocacy and opposition, commits, tickets — merges them in
> chronological order, and narrates the whole story with dates. This is Temporal GraphRAG."

### Demo 3 — Graph adapts to an attached file + export

**[DO]** Attach a `.txt` dataset via the paperclip → open the **Graph** tab → **Export JSON**.

**[SAY]**
> "Attach a file and the knowledge graph **adapts to it** — the badge shows 'Adapted from …'.
> It parses structured datasets and falls back to a generic extractor for any text. The Export
> button downloads the adapted graph as reusable JSON. The file stays scoped to the
> conversation, so I can keep asking questions without re-attaching."

**[DO]** Ask a follow-up about the file to prove it: **"Who opposed the database migration?"**

### Demo 4 — Multi-user (10s)

**[DO]** Point at the sidebar; (if time) log out → log in as `priya.sharma@meridian.io` / `demo1234`.

**[SAY]**
> "Auth is real — bcrypt-hashed accounts, login and signup — and every user sees **only their
> own** conversation history."

---

## 5. Wrap-Up (30s)

**[SAY]**

> "To summarize: a full pipeline from raw enterprise data to a queryable knowledge graph, an
> LLM retrieval layer that's **safe by construction**, and a polished frontend that grounds
> every answer in citable evidence — including file attachments and multi-user support.
>
> The knowledge graph is the differentiator: instead of retrieving *similar text*, we retrieve
> *facts, relationships, and timelines*."

---

## 6. Quick Answers (if asked)

- **Why Neo4j?** Questions are relational ("who argued against X"); a graph stores who/what/when
  directly, and temporal edges let us narrate in order.
- **How do you stop bad queries?** Strict schema prompting + pre-flight validation that blocks
  write keywords and unknown types/variables, with one auto-retry; graceful fallback otherwise.
- **How do you stop hallucinations?** The narrative LLM only sees real query results and must
  return JSON with the source IDs it used; source cards are filtered to IDs actually in the
  results.
- **Is the data real?** Synthetic by design (fictional Meridian Systems, 2023), built to demo a
  real pipeline that works on real data in the same format.
