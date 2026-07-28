#!/usr/bin/env python3
"""
ingest_to_neo4j.py -- Ingest ChronoGraph extracted triples into Neo4j.

Reads extracted_triples.json, creates nodes (Person / Technology / Ticket)
and directed relationships with timestamp + source_id as edge properties,
then runs sanity-check Cypher queries.

Usage:
    python ingestion/ingest_to_neo4j.py                         # ingest all 164 triples
    python ingestion/ingest_to_neo4j.py --limit 15              # test on first 15 triples
    python ingestion/ingest_to_neo4j.py --limit 15 --clear      # clear DB first, then test
    python ingestion/ingest_to_neo4j.py --insecure-ssl          # skip cert verification (self-signed certs)
    python ingestion/ingest_to_neo4j.py --triples path/to/file  # custom triples path

Environment variables (from .env):
    NEO4J_URI      -- bolt:// or neo4j:// URI (with or without +s / +ssc)
    NEO4J_USER     -- username (default: neo4j)
    NEO4J_PASSWORD -- password
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from neo4j import GraphDatabase

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TRIPLES = PROJECT_ROOT / "extraction" / "extracted_triples.json"
DOTENV_PATH = PROJECT_ROOT / ".env"

# The 5 employees appearing in the mock dataset
KNOWN_PEOPLE = {"Alice", "Bob", "Charlie", "Dave", "Eve"}

# Matches ticket identifiers like "CHRONO-109" or "Ticket CHRONO-109"
TICKET_PATTERN = re.compile(r"(?:Ticket\s+)?(CHRONO-\d+)", re.IGNORECASE)

load_dotenv(DOTENV_PATH)


# ---------------------------------------------------------------------------
# Node classification helpers
# ---------------------------------------------------------------------------

def classify_node(name: str) -> str:
    """Return Neo4j label -- Person, Ticket, or Technology."""
    if name in KNOWN_PEOPLE:
        return "Person"
    if TICKET_PATTERN.fullmatch(name):
        return "Ticket"
    return "Technology"


def normalize_name(name: str) -> str:
    """Normalise a node name: strip 'Ticket ' prefix, uppercase ticket IDs."""
    m = TICKET_PATTERN.match(name)
    if m:
        return m.group(1).upper()
    return name

# ---------------------------------------------------------------------------
# Core ingestion
# ---------------------------------------------------------------------------

def ingest(triples_path: str | Path, limit: int | None = None,
           clear_first: bool = False, insecure_ssl: bool = False) -> None:
    # 1. Load triples
    triples_path = Path(triples_path)
    if not triples_path.exists():
        print(f"[ERROR] Triples file not found: {triples_path}")
        print("   Run extraction/extract_triples.py --all first.")
        sys.exit(1)
    with open(triples_path) as f:
        triples: list[dict] = json.load(f)

    total = len(triples)
    if limit is not None and limit < total:
        triples = triples[:limit]
        mode = f"TEST MODE -- first {limit} of {total} triples"
    else:
        mode = f"FULL RUN -- all {total} triples"

    print(f"[LOAD] {mode}")
    print()

    # 2. Connect to Neo4j
    uri = os.getenv("NEO4J_URI")
    user = os.getenv("NEO4J_USER", "neo4j")
    password = os.getenv("NEO4J_PASSWORD")

    if not uri or not password:
        print("[ERROR] NEO4J_URI and NEO4J_PASSWORD must be set in .env")
        sys.exit(1)

    # Build driver kwargs.
    # neo4j+s:// requires strict CA verification, which fails on Microsoft
    # Store Python (no default trust store). Switch to neo4j+ssc:// which
    # keeps TLS encryption but trusts self-signed certs.
    driver_kwargs: dict = {
        "auth": (user, password),
    }

    if insecure_ssl:
        print("[SSL] Certificate verification DISABLED (--insecure-ssl)")

    driver_uri = uri
    if "+ssc" not in uri and "+s://" in uri:
        driver_uri = uri.replace("+s://", "+ssc://")
        print(f"[SSL] Using neo4j+ssc:// (encrypted, self-signed certs accepted)")

    driver = GraphDatabase.driver(driver_uri, **driver_kwargs)

    driver = GraphDatabase.driver(uri, **driver_kwargs)
    try:
        driver.verify_connectivity()
    except Exception as e:
        print(f"[ERROR] Cannot connect to Neo4j at {uri}: {e}")
        driver.close()
        sys.exit(1)

    print(f"[OK] Connected to Neo4j at {uri}")

    with driver.session() as session:
        # Optional: clear the database
        if clear_first:
            summary = session.run("MATCH (n) DETACH DELETE n").consume()
            print(f"[CLEAR] Database cleared ({summary.counters.nodes_deleted} nodes deleted)")
            print()

        # ----- 2a. Create all unique nodes -----
        created_nodes: set[str] = set()
        for triple in triples:
            for raw_name in (triple["subject"], triple["object"]):
                safe = normalize_name(raw_name)
                if safe not in created_nodes:
                    lbl = classify_node(safe)
                    session.run(
                        f"MERGE (n:{lbl} {{name: $name}})",
                        name=safe,
                    )
                    created_nodes.add(safe)

        print(f"[NODES] Unique nodes created/merged: {len(created_nodes)}")
        for lbl in ("Person", "Technology", "Ticket"):
            cnt = session.run(
                f"MATCH (n:{lbl}) RETURN count(n) AS c"
            ).single()["c"]
            print(f"    {lbl}: {cnt}")

        print()

        # ----- 2b. Create all relationships -----
        edge_count = 0
        for triple in triples:
            subj = normalize_name(triple["subject"])
            obj = normalize_name(triple["object"])
            rel = triple["relation"]
            ts = triple["timestamp"]
            sid = triple["source_id"]

            session.run(
                f"""
                MATCH (a {{name: $subj}})
                MATCH (b {{name: $obj}})
                MERGE (a)-[r:{rel} {{timestamp: $ts, source_id: $sid}}]->(b)
                """,
                subj=subj, obj=obj, ts=ts, sid=sid,
            )
            edge_count += 1

        print(f"[EDGES] Relationships created/merged: {edge_count}")
        for rel in ("ADVOCATED_FOR", "ARGUED_AGAINST", "COMMITTED_CODE",
                     "ASSIGNED_TO", "RESOLVED", "MENTIONED"):
            cnt = session.run(
                f"MATCH ()-[r:{rel}]->() RETURN count(r) AS c"
            ).single()["c"]
            print(f"    {rel}: {cnt}")

        print()

        # ----- 3. Sanity-check queries -----
        _run_queries(session)

    driver.close()
    print("[DONE] Ingestion complete!")


# ---------------------------------------------------------------------------
# Sanity-check queries
# ---------------------------------------------------------------------------

def _run_queries(session) -> None:
    print("=" * 60)
    print("SANITY CHECKS")
    print("=" * 60)

    # 3a. All relationships involving Dave (both outgoing and incoming)
    print("\n--- All relationships involving Dave ---")
    result = session.run("""
        MATCH (d:Person {name: 'Dave'})-[r]-(other)
        RETURN type(r)          AS relation,
               other.name      AS other,
               labels(other)   AS other_labels,
               r.source_id     AS source_id,
               r.timestamp     AS timestamp,
               CASE WHEN startNode(r).name = 'Dave'
                    THEN 'outgoing' ELSE 'incoming' END AS direction
        ORDER BY r.timestamp
    """)
    rows = list(result)
    if not rows:
        print("  (none)")
    for row in rows:
        arrow = "-->" if row['direction'] == 'outgoing' else "<--"
        print(f"  Dave {arrow} {row['other']} ({row['other_labels'][0]})  [{row['relation']}]  [{row['source_id']}, {row['timestamp']}]")

    # 3b. All ARGUED_AGAINST edges
    print("\n--- All ARGUED_AGAINST relationships ---")
    result = session.run("""
        MATCH (source)-[r:ARGUED_AGAINST]->(target)
        RETURN source.name    AS source,
               labels(source)  AS source_label,
               target.name    AS target,
               labels(target)  AS target_label,
               r.source_id    AS source_id,
               r.timestamp    AS timestamp
        ORDER BY r.timestamp
    """)
    rows = list(result)
    if not rows:
        print("  (none)")
    for row in rows:
        print(f"  {row['source']} ({row['source_label'][0]}) --ARGUED_AGAINST--> {row['target']} ({row['target_label'][0]})"
              f"  [{row['source_id']}, {row['timestamp']}]")

    # 3c. All RESOLVED edges (to confirm Rule 3 fix)
    print("\n--- All RESOLVED relationships ---")
    result = session.run("""
        MATCH (source)-[r:RESOLVED]->(target)
        RETURN source.name    AS source,
               target.name    AS target,
               r.source_id    AS source_id,
               r.timestamp    AS timestamp
        ORDER BY r.timestamp
    """)
    rows = list(result)
    if not rows:
        print("  (none)")
    for row in rows:
        print(f"  {row['source']} --RESOLVED--> {row['target']}"
              f"  [{row['source_id']}, {row['timestamp']}]")

    # 3d. Top 10 most connected nodes
    print("\n--- Top 10 most connected nodes ---")
    result = session.run("""
        MATCH (n)-[r]-()
        RETURN n.name       AS name,
               labels(n)    AS labels,
               count(r)     AS connections
        ORDER BY connections DESC
        LIMIT 10
    """)
    for row in result:
        print(f"  {row['name']} ({row['labels'][0]}): {row['connections']} connections")

    print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest ChronoGraph triples into Neo4j"
    )
    parser.add_argument(
        "--triples", default=str(DEFAULT_TRIPLES),
        help=f"Path to extracted triples JSON (default: {DEFAULT_TRIPLES})",
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Process only the first N triples (test mode)",
    )
    parser.add_argument(
        "--clear", action="store_true",
        help="Delete all existing nodes/relationships before ingesting",
    )
    parser.add_argument(
        "--insecure-ssl", action="store_true",
        help="Skip SSL certificate verification (use for AuraDB with self-signed certs)",
    )
    args = parser.parse_args()

    ingest(
        triples_path=args.triples,
        limit=args.limit,
        clear_first=args.clear,
        insecure_ssl=args.insecure_ssl,
    )


if __name__ == "__main__":
    main()
