# ChronoGraph — Final Presentation Script

> **What this is:** A complete, read-aloud presentation script for your project manager demo.
> Sections marked **[SAY]** are what you say. Sections marked **[DO]** are what you click/do on screen.
> Time estimate: ~15 minutes (2 min intro + 8 min demo + 5 min Q&A).

---

## 1. Opening — Elevator Pitch (60 seconds)

**[SAY]**

> "ChronoGraph is a **Temporal GraphRAG system** — a chat assistant that lets you ask questions
> about your organization's history in plain English and get **timeline-aware, evidence-backed
> answers** with citations back to the original Slack messages, Git commits, and Jira tickets.
>
> The core idea: instead of dumping documents into a chatbot, we first **extract the people,
> technologies, and decisions** from the data and store them as a **knowledge graph**. Every
> connection in that graph carries a **timestamp and a source ID**. When you ask a question, the
> system **writes a graph query from your question, retrieves the exact relevant facts, and
> narrates the story** — telling you *what* happened, *when* it happened, *who* was involved,
> and *where the evidence is*.
>
> It's a full stack: a Python data pipeline, a Neo4j graph database, an LLM retrieval layer,
> and a polished Next.js frontend — plus authentication, multi-user conversation history, and
> file-attachment support."

---

## 2. The Problem

**[SAY]**

> "Enterprise knowledge lives in silos — Slack conversations, Jira tickets, Git history.
> Searching them is hard, and asking 'why did we do X?' requires reading months of history.
> Traditional chatbots hallucinate and can't cite their sources.
>
> ChronoGraph solves this with three guarantees:
> **1. Grounded answers** — every claim comes from graph data, never invented.
> **2. Citations** — every answer points back to the exact source records.
> **3. Temporal awareness** — the timeline of events is first-class, not an afterthought."

---

## 3. Architecture Overview (show this on screen / draw it)

**[DO]** Show the architecture diagram (see `README.md` or sketch):

```
┌─────────────┐   ┌──────────────┐   ┌──────────────┐   ┌─────────────┐
│  Mock data  │──▶│  Extraction  │──▶│  Ingestion   │──▶│   Neo4j     │
│ (90 records)│   │  (Groq LLM)  │   │  (Cypher)    │   │  Graph DB   │
└─────────────┘   └──────────────┘   └──────────────┘   └──────┬──────┘
                                                               │  runQuery
┌─────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────▼──────┐
│  Frontend   │◀──│  /api/chat   │◀──│ textToCypher │   │ cypherSafety│
│  Next.js    │   │  narrative   │   │ classify +   │   │ validation  │
│  chat+graph │   │  LLM answer  │   │ generate     │   │ (read-only) │
└─────────────┘   └──────────────┘   └──────────────┘   └─────────────┘
```

**[SAY]**

> "The pipeline has three stages:
> 1. **Data layer (Python):** a synthetic dataset of 90 realistic records is generated, then an
>    LLM extracts 164 relationship triples, and a script loads them into Neo4j.
> 2. **Retrieval layer (TypeScript):** your question is classified, converted into safe Cypher,
>    run against the graph, and the results are fed to an LLM that writes a narrative answer.
> 3. **Presentation layer (React):** a chat UI with source cards, a live knowledge-graph
>    visualization, a timeline, authentication, and file attachment."

---

## 4. Module-by-Module Walkthrough

### 4a. Data Pipeline (Python)

**[SAY]**

> "The data layer produces the knowledge graph that everything else runs on."

| File | Role |
|---|---|
| `data/generate_mock_dataset.py` | Generates 90 synthetic records — 36 Slack messages, 27 Jira tickets, 27 Git commits — for 5 fictional employees (Alice, Bob, Charlie, Dave, Eve), spanning **Jan 1 – Jun 30, 2023**, telling the story of an AWS → GCP migration. Seed fixed for reproducibility. |
| `extraction/extract_triples.py` | Sends the records to the **Groq LLM** in batches and extracts relationship triples (e.g., `Charlie —ADVOCATED_FOR→ GCP`), with validation rules (no self-referential or null-object triples). Output: `extracted_triples.json` (164 triples). |
| `ingestion/ingest_to_neo4j.py` | Creates the graph in Neo4j: **Person / Technology / Ticket** nodes and 6 relationship types, with `timestamp` + `source_id` on every edge. Runs sanity-check Cypher. |

**[SAY]**

> "The graph schema is deliberately strict:
> - **Nodes:** `Person`, `Technology`, `Ticket`
> - **Relationships:** `ADVOCATED_FOR`, `ARGUED_AGAINST`, `COMMITTED_CODE`,
>   `ASSIGNED_TO`, `RESOLVED`, `MENTIONED`
> - **Edge properties:** every relationship carries `timestamp` and `source_id`.
>
> That strict schema is what makes safe, reliable query generation possible."

---

### 4b. Retrieval Layer — the brain (TypeScript / Next.js)

**[SAY]**

> "This is the most interesting part. There are three components:"

| File | Role |
|---|---|
| `lib/neo4j.ts` | Singleton Neo4j driver; `runQuery()` executes Cypher with parameters. |
| `lib/textToCypher.ts` | **Question classification** (simple vs. synthesis) + **natural-language → Cypher generation** via Groq, with strict schema prompting, worked examples, and 429 rate-limit backoff. |
| `lib/cypherSafety.ts` | **Pre-flight validation**: rejects any query containing write keywords (`CREATE/DELETE/MERGE/SET/REMOVE/DROP`) and any query referencing relationship types, node labels, or variables outside the known schema. **Broken or dangerous Cypher never reaches Neo4j.** |
| `app/api/chat/route.ts` | The orchestrator: classify → generate → validate (retry once) → run → narrate → cite. |

**[SAY — explain the two-stage retrieval]**

> "A single query can't answer every question, so we split retrieval into two pipelines:
>
> **Simple questions** — 'Who argued against the GCP migration?', 'What did Dave work on?' —
> use one single-hop Cypher query, exactly as before.
>
> **Synthesis questions** — 'Why did we migrate from AWS to GCP?' — are detected by a
> deterministic classifier (no extra LLM call), and answered by a **multi-query pipeline**:
> the LLM generates 2–4 *independent* single-hop queries, one per relationship type (reasons,
> work done, tickets, discussion). Each one passes the same safety validation. They all run
> against Neo4j in parallel, the rows are **merged chronologically by timestamp**, sampled
> evenly if needed, and the narrative LLM weaves them into one coherent story.
>
> Every failure path — bad Cypher, zero results, Neo4j down — returns a graceful, honest
> fallback message in the same response shape, so the frontend never crashes."

---

### 4c. File Attachments

**[SAY]**

> "You can attach a document — `.txt`, `.md`, `.json`, `.csv`, or a **PDF** — and the chat
> answers strictly from that document. Two nice details:
>
> 1. **Conversation-scoped:** attach once, ask as many questions as you want — the file stays
>    as the context for the whole conversation until you remove it.
> 2. **Encoding-aware reading:** text files are decoded BOM-aware (UTF-8, UTF-16 LE/BE,
>    windows-1252) so Windows Notepad saves never corrupt the content. PDFs are parsed
>    server-side with `pdf-parse`."

---

### 4d. Graph Adaptation + Export

**[SAY]**

> "The right-hand panel shows the knowledge graph. When you attach a file, **the graph adapts
> to it**: a dependency-free heuristic parser (`lib/parseDataset.ts`) extracts people,
> technologies, tickets, links, and timeline events. It handles the structured Meridian format
> *and* falls back to a generic extractor for **any** text file — prose, logs, ticket lists.
> The panel badge shows 'Adapted from <filename>'. The **Export JSON** button downloads the
> current graph as nodes/links so the parsed dataset can be reused."

---

### 4e. Authentication & Multi-User

**[SAY]**

> "The app has real authentication — no external providers.
> - **Auth:** NextAuth (Auth.js) with the **Credentials provider**; users are `:User` nodes in
>   the same Neo4j database, kept **completely separate** from the knowledge graph. Passwords
>   are **bcrypt-hashed** — never stored in plaintext.
> - **Login / Signup:** real pages with validation (email format, password ≥ 8 chars, duplicate
>   email detection, atomic `MERGE` creation).
> - **Route protection:** edge middleware redirects unauthenticated users to `/login`; the chat
>   API is gated too.
> - **Per-user conversations:** each account's conversation history is stored under its own key
>   (`chrono-conversations-v1-<email>`), so **no user ever sees another user's chats** — verified
>   end-to-end across signup → chat → logout → re-login.
> - **Seeding:** `npm run seed:users` creates demo accounts directly in Neo4j."

---

### 4f. Frontend (React / Next.js 14)

**[SAY]**

> "The UI is a responsive three-pane analytical tool:"

| Component | Role |
|---|---|
| `components/chat/ChatWindow.tsx` | Message thread, welcome message, auto-scroll. |
| `components/chat/ChatInput.tsx` | Real fetch to `/api/chat`, loading/stop states, **attachment button** with filename chip, suggested-query cards on empty state. |
| `components/chat/MessageBubble.tsx` | User vs. assistant bubbles, collapsible **source cards** with platform icons. |
| `components/graph/GraphPanel.tsx` | Knowledge Graph / Timeline tabs, dataset badge, **Export JSON**. |
| `components/graph/GraphView.tsx` | Force-directed graph (`react-force-graph-2d`), zoom/center controls, node highlighting. |
| `components/graph/TimelineView.tsx` | Chronological event cards with platform-branded reference icons. |
| `components/layout/Sidebar.tsx`, `Navbar.tsx` | Conversation list (per-user), New Conversation, panel collapse toggle. |
| `lib/chat-context.tsx` | **Central state**: conversations, pending status, abort (stop generation), per-user persistence. |
| `lib/graph-data-context.tsx` | Rebuilds graph/timeline when the active conversation's attachment changes. |
| `lib/highlight-context.tsx` | Cross-pane highlighting (chat citations ↔ graph/timeline). |

---

## 5. LIVE DEMO SCRIPT (follow this exactly)

### Demo 0 — Login

**[DO]** Open `http://localhost:3000`. You'll be redirected to `/login`.

**[SAY]**
> "Every route is protected — let's log in with a seeded account."
> Email: `alex.stevens@chronograph.dev` · Password: `demo1234`

**[DO]** Log in, land on the chat home.

### Demo 1 — Chat with citations (Simple question)

**[SAY]**
> "First, a targeted question — the type that hits one relationship type."

**[DO]** Type: **"Who argued against the GCP migration?"** → Send.

**[SAY — while waiting]**
> "Watch: the question is classified as simple, converted into a read-only Cypher query,
> validated, and run against Neo4j. The answer cites the exact Slack messages."

**[DO]** Click **Sources (N)** under the answer → show the source cards.

**[SAY]**
> "Every source card shows the platform, author, timestamp, and excerpt — grounded in
> `source_id` + `timestamp` pulled from the graph edges."

### Demo 2 — Synthesis question (the showstopper)

**[SAY]**
> "Now the harder one — a broad 'why' question that no single query can answer."

**[DO]** Type: **"Why did we migrate from AWS to GCP, and what were the main engineering concerns?"** → Send.

**[SAY — while waiting]**
> "This is classified as a **synthesis** question. The system generates several independent
> queries — one for advocacy/opposition, one for commits, one for tickets — runs them in
> parallel, merges the results chronologically, and asks the LLM to narrate the whole story
> with dates. This is where Temporal GraphRAG shines."

**[DO]** Scroll the answer. Show the timeline tab (right panel → **Timeline**) to reinforce the chronology.

### Demo 3 — Graph panel + adaptation + export

**[DO]** Right panel → **Knowledge Graph** tab.

**[SAY]**
> "This is the knowledge graph: people, technologies, and tickets as nodes; the six
> relationship types as edges. I can zoom, recenter, and click nodes to see connections."

**[DO]** Attach a dataset file (e.g. a `.txt` copy of your dataset, any encoding):
1. Click the paperclip in the chat input → select the file.
2. Watch the filename chip appear.
3. Open the **Graph** tab.

**[SAY]**
> "The graph **adapts to the attached file** — the badge now reads 'Adapted from …'. The parser
> handles the structured format and falls back to a generic extractor for any text. Let me
> export this adapted graph."

**[DO]** Click **Export JSON** → a `graph-*.json` file downloads.

**[SAY]**
> "That JSON of nodes and links can be reused — the parsed dataset isn't trapped in the UI."

### Demo 4 — File-based Q&A (attach once, ask many)

**[DO]** With the file still attached, ask: **"Who opposed the database migration?"**

**[SAY]**
> "The answer comes strictly from the attached document. And because the file is scoped to the
> conversation, I can keep asking follow-ups **without re-attaching** it."

**[DO]** Ask a second question to prove it: **"What was the final outcome?"**

### Demo 5 — Conversation history + multi-user isolation

**[DO]** Click **New Conversation** → type a question → open the sidebar.

**[SAY]**
> "New conversations are real: they appear in the sidebar and I can click back into any of
> them. And these conversations are scoped to *my* account."

**[DO]** (Optional, if time) Log out → log in as `priya.sharma@meridian.io` / `demo1234` → show their separate, empty history.

### Demo 6 — Signup (optional)

**[DO]** Click **Sign up** on the login page, create a test account.

**[SAY]**
> "Real signup: validation, duplicate-email detection, bcrypt hashing, auto-login."

---

## 6. Tech Stack (for the stack slide)

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) + React 18 + TypeScript |
| Styling | Tailwind CSS |
| Graph DB | Neo4j (bolt driver, `neo4j-driver`) |
| LLM | Groq API — `llama-3.1-8b-instant` (text→Cypher, narrative, triple extraction) |
| Auth | NextAuth v5 (Auth.js), Credentials provider, JWT, bcryptjs |
| Graph viz | `react-force-graph-2d` |
| Icons | `lucide-react` |
| PDF parsing | `pdf-parse` |
| Data pipeline | Python (json, dotenv, openai SDK, neo4j driver) |
| Storage | Neo4j (graph + `:User` accounts) · localStorage (per-user conversations) |

**Env vars needed:** `GROK_API_KEY`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`,
`NEO4J_DATABASE`, `AUTH_SECRET`, `AUTH_TRUST_HOST`.

**Key commands:**
```bash
npm run dev              # dev server
npm run build            # production build
npm run seed:users       # seed demo accounts (alex.stevens@… / priya.sharma@…, pw demo1234)
python data/generate_mock_dataset.py      # regenerate dataset
python extraction/extract_triples.py --all  # re-extract triples
python ingestion/ingest_to_neo4j.py        # load graph into Neo4j
```

---

## 7. Q&A Cheat Sheet (anticipated questions)

**Q: Why Neo4j instead of a vector database?**
> A: The questions are relational — "who argued against X", "what did Dave work on" — and the
> answers need to cite exact sources. A graph stores the *who/what/when/where* structure
> directly, and the temporal edges let us narrate the story in order. Vector search finds
> similar text; a graph finds *facts and relationships*.

**Q: How do you prevent the LLM from generating dangerous or broken queries?**
> A: Three layers: a strict schema prompt (only 6 relationship types, worked examples),
> pre-flight validation that blocks write keywords and unknown types/variables, and a single
> auto-retry that feeds the exact error back to the model. If it still fails, the user gets a
> graceful fallback — a bad query never reaches the database.

**Q: How is hallucination controlled?**
> A: The narrative LLM is given only the actual query results and is required to respond in
> JSON with the source IDs it used. Source cards are then filtered to only the IDs actually
> present in the graph results. The answer is grounded, not free-generated.

**Q: Is the data real?**
> A: It's a synthetic dataset (fictional company 'Meridian Systems', AWS→GCP migration,
> Jan–Jun 2023) built specifically to demo the pipeline. The pipeline itself is real and
> would work on real exported Slack/Git/Jira data with the same format.

**Q: What's the difference between simple and synthesis questions?**
> A: Simple questions match one relationship type and use one query. Synthesis questions
> ('why', 'how', 'timeline') trigger a multi-query pipeline: 2–4 independent queries across
> different relationship types, merged chronologically into one narrative.

**Q: How do you scale / how fast is it?**
> A: Queries are single-hop and validated; sub-queries run in parallel with a 25-second
> timeout each. The LLM has automatic 429 rate-limit backoff. Row counts are capped and
> evenly sampled so the context window is never blown.

**Q: Where is user data stored? Are conversations shared?**
> A: Accounts are `:User` nodes in Neo4j with bcrypt-hashed passwords, kept separate from the
> knowledge graph. Conversations are per-user in localStorage keyed by email — each user sees
> only their own history. (Note: persistence is per-browser; cross-device sync would be the
> natural next step.)

---

## 8. Honest Limitations (say these only if asked)

- Dataset is synthetic by design (demo data).
- The generic text parser is a heuristic — perfect on the Meridian format, good but
  coarser on arbitrary prose.
- Conversation history is stored per-browser (localStorage), not in a server database yet.
- The graph visualizer renders client-side with `react-force-graph-2d`; very large graphs
  would need layout tuning.

---

*End of script. Good luck — you've got a working, verified, end-to-end system to show.*
