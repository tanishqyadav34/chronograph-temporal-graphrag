# chronograph-temporal-graphrag

ChronoGraph is a Temporal GraphRAG system that transforms enterprise data into a knowledge graph, enabling users to query organizational history through natural language. It delivers timeline-aware, evidence-backed insights by connecting people, technologies, and decisions.

## Overview

Ask questions in plain English — *"Why did we migrate from AWS to GCP?"* — and get a chronological, **evidence-backed narrative** with citations back to the original Slack messages, Git commits, and Jira tickets.

Three guarantees:

1. **Grounded answers** — every claim comes from graph data retrieved on demand, never invented.
2. **Citations** — answers return `source_id`s; the UI renders source cards for each one.
3. **Temporal awareness** — every graph edge carries a `timestamp` + `source_id`, so answers can be narrated in order.

## Architecture

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

**Three stages:**

- **Data layer (Python)** — `data/generate_mock_dataset.py` generates 90 synthetic records (36 Slack, 27 Jira, 27 Git; Jan–Jun 2023; AWS→GCP migration story). `extraction/extract_triples.py` sends them to the Groq LLM and extracts 164 relationship triples. `ingestion/ingest_to_neo4j.py` loads them into Neo4j with `timestamp` + `source_id` on every edge.
- **Retrieval layer (TypeScript)** — `/api/chat` classifies the question (**simple** → single Cypher query; **synthesis** → 2–4 independent single-hop queries merged chronologically), generates Cypher via Groq, validates it **before execution**, runs it against Neo4j, and feeds the results to a narrative LLM that returns a grounded answer + cited source IDs.
- **Presentation layer (React)** — chat UI with collapsible source cards, a live force-directed knowledge graph that **adapts to attached files** (with JSON export), a timeline view, authentication, and per-user conversation history.

## Graph Schema

Strict, validated schema (the safety layer rejects anything outside it):

| Nodes | `Person` · `Technology` · `Ticket` |
|---|---|
| Relationships | `ADVOCATED_FOR` · `ARGUED_AGAINST` · `COMMITTED_CODE` · `ASSIGNED_TO` · `RESOLVED` · `MENTIONED` |
| Edge properties | `timestamp` (ISO datetime) · `source_id` (original record id) |

## Key Features

- **Two-stage retrieval** — simple "who/what" questions vs. broad "why/how/timeline" synthesis questions handled by a multi-query pipeline.
- **Cypher safety** — `lib/cypherSafety.ts` blocks write keywords (`CREATE/DELETE/MERGE/SET/REMOVE/DROP`) and structurally invalid queries (unknown types/labels, unbound variables), with one auto-retry before graceful fallback. Broken queries never reach Neo4j.
- **File attachments** — `.txt`/`.md`/`.json`/`.csv`/`.pdf` answered strictly from the document; conversation-scoped (attach once, ask many); BOM-aware text decoding (UTF-8/UTF-16/windows-1252).
- **Graph adaptation** — attached files rebuild the right-panel graph + timeline (structured Meridian format + generic text fallback); **Export JSON** downloads the adapted graph.
- **Authentication** — NextAuth (Credentials), bcrypt-hashed `:User` nodes in Neo4j (separate from the knowledge graph), login + signup pages, edge middleware protection.
- **Per-user conversations** — each account's history persisted under its own localStorage key; users never see each other's chats.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS · `react-force-graph-2d` · `lucide-react` |
| Backend | Next.js API routes (`/api/chat`, `/api/signup`) |
| Database | Neo4j (`neo4j-driver`) — knowledge graph + `:User` accounts |
| LLM | Groq API — `llama-3.1-8b-instant` (triple extraction, text→Cypher, narrative) |
| Auth | NextAuth v5 · Credentials provider · JWT · `bcryptjs` |
| Files | `pdf-parse` (server-side PDF text extraction) |
| Data pipeline | Python (`json`, `dotenv`, `openai` SDK, `neo4j` driver) |

## Quick Start

```bash
# 1. Environment
#    Copy .env with: GROK_API_KEY, NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD,
#    NEO4J_DATABASE, AUTH_SECRET, AUTH_TRUST_HOST

# 2. Data pipeline (optional — graph may already be loaded)
python data/generate_mock_dataset.py        # regenerate dataset
python extraction/extract_triples.py --all  # re-extract triples
python ingestion/ingest_to_neo4j.py         # load graph into Neo4j

# 3. Seed demo accounts (alex.stevens@chronograph.dev / priya.sharma@meridian.io, pw demo1234)
npm run seed:users

# 4. Run
npm install
npm run dev        # http://localhost:3000 → redirected to /login
npm run build      # production build check
```

## Repository Layout

```
app/            Next.js pages + API routes (chat, signup)
components/     UI: chat, graph/timeline panels, layout (sidebar/navbar)
lib/            Core logic: chat-context, graph-data-context, parseDataset,
                neo4j, textToCypher, cypherSafety, highlight-context, mock data
scripts/        seed_users.mjs — demo account seeder
extraction/     Python: triple extraction from the dataset (Groq)
ingestion/      Python: load triples into Neo4j
data/           Dataset generator + mock_dataset.json
```

> See `PRESENTATION_SCRIPT.md` for a full demo walkthrough and Q&A prep.
