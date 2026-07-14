#!/usr/bin/env python3
"""
extract_triples.py — Task 2: Extraction Pipeline

Reads mock_dataset.json, sends each record's content to the Groq API
to extract relationship triples, and outputs the results.

Restricted relations: ADVOCATED_FOR, ARGUED_AGAINST, COMMITTED_CODE,
                     ASSIGNED_TO, RESOLVED, MENTIONED

Usage:
    python extraction/extract_triples.py            # run on first 15 records
    python extraction/extract_triples.py --all       # run on all 90 records
"""

import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

# ── Configuration ──────────────────────────────────────────────────────────

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = PROJECT_ROOT / "data" / "mock_dataset.json"
OUTPUT_DIR = PROJECT_ROOT / "extraction"
TRIPLES_OUTPUT = OUTPUT_DIR / "extracted_triples.json"
REVIEW_OUTPUT = OUTPUT_DIR / "test_review.md"

# Groq API settings (OpenAI-compatible)
# Using llama-3.1-8b-instant: fastest/cheapest model for structured JSON extraction
GROQ_MODEL = "llama-3.1-8b-instant"

# Restrict to these relation labels exactly
VALID_RELATIONS = [
    "ADVOCATED_FOR",
    "ARGUED_AGAINST",
    "COMMITTED_CODE",
    "ASSIGNED_TO",
    "RESOLVED",
    "MENTIONED",
]

# Batch size for the test run (first N records)
TEST_BATCH_SIZE = 15

# Delay between API calls (seconds) to avoid rate limiting
API_DELAY_SECONDS = 0.5

# Retry settings for rate-limited API calls
RETRY_MAX_ATTEMPTS = 3
RETRY_BASE_DELAY = 1.0  # seconds; doubles each retry (1s, 2s, 4s)

# ── System prompt for Groq ────────────────────────────────────────────────

SYSTEM_PROMPT = f"""You are a knowledge graph extraction assistant for enterprise communication data.

Given a message from Slack, a Git commit, or a Jira ticket, extract all relevant relationship triples from the content.

Each triple must have exactly these fields:
- "subject": the entity performing the action (person name, team, or technology)
- "relation": exactly one of {VALID_RELATIONS}
- "object": the entity the action is directed toward (person, technology, ticket, concept)
- "timestamp": the ISO timestamp of the original record (pass through as-is)
- "source_id": the record's source_id (pass through as-is)

Guidelines for each relation type:
- ADVOCATED_FOR: person advocates/recommends/supports a technology, approach, or idea
- ARGUED_AGAINST: person argues against/opposes/skeptical of a technology, approach, or idea
- COMMITTED_CODE: person authored a code change (feature, fix, chore, docs, refactor, test, script, ci)
- ASSIGNED_TO: a ticket or task is assigned to a person
- RESOLVED: a task, issue, or problem is completed, resolved, or finished
- MENTIONED: a person, technology, or concept is mentioned in the message context

Return a JSON object with a single key "triples" whose value is an array of triple objects.
If no triples can be extracted, return {{"triples": []}}."""


# ── Helpers ────────────────────────────────────────────────────────────────

def load_dataset(path: Path) -> list[dict]:
    """Load the mock dataset from JSON."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    print(f"Loaded {len(data)} records from {path}")
    return data


def build_user_message(record: dict) -> str:
    """Build the user message for a single record."""
    parts = [
        f"source_type: {record['source_type']}",
        f"author: {record['author']}",
        f"content: {record['content']}",
        f"source_id: {record['source_id']}",
        f"timestamp: {record['timestamp']}",
    ]
    return "\n".join(parts)


def extract_triples(client: OpenAI, record: dict) -> list[dict]:
    """Call the Groq API to extract triples from a single record.
    
    Retries up to RETRY_MAX_ATTEMPTS times with exponential backoff
    on rate-limit (429) errors.
    """
    user_msg = build_user_message(record)
    record_id = record["source_id"]

    for attempt in range(1, RETRY_MAX_ATTEMPTS + 1):
        try:
            response = client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_msg},
                ],
                response_format={"type": "json_object"},
                temperature=0.0,
            )

            raw = response.choices[0].message.content
            parsed = json.loads(raw)
            triples = parsed.get("triples", [])

            if attempt > 1:
                print(f"    retry {record_id}: succeeded on attempt {attempt}")

        except Exception as e:
            error_str = str(e)
            is_rate_limit = "429" in error_str or "rate limit" in error_str.lower()

            if is_rate_limit and attempt < RETRY_MAX_ATTEMPTS:
                delay = RETRY_BASE_DELAY * (2 ** (attempt - 1))
                print(f"    retry {record_id}: rate limited (attempt {attempt}/{RETRY_MAX_ATTEMPTS}), waiting {delay}s...")
                time.sleep(delay)
                continue  # try next attempt

            if attempt > 1:
                print(f"    retry {record_id}: failed after {attempt} attempts: {e}")
            else:
                print(f"    [!] {record_id}: API/parse error: {e}. Returning empty triples.")
            return []

        # API call succeeded — enrich and validate outside the try block
        for triple in triples:
            triple["timestamp"] = record["timestamp"]
            triple["source_id"] = record["source_id"]
            if triple.get("relation") not in VALID_RELATIONS:
                triple["relation"] = "MENTIONED"  # safe fallback

        triples = validate_triples(triples, record)
        return triples

    return []


def validate_triples(triples: list[dict], record: dict) -> list[dict]:
    """Apply post-processing filters to clean extracted triples.
    
    Rules:
    1. Strip self-referential triples (subject == object)
    2. Strip triples where object is null, None, empty, or "null"
    3. Validate RESOLVED: only keep if record content explicitly contains
       "Done", "Closed", or "Resolved" status indicators
    """
    validated: list[dict] = []
    record_id = record["source_id"]
    content = record.get("content", "")

    for triple in triples:
        subject = (triple.get("subject") or "").strip()
        obj = (triple.get("object") or "").strip()
        relation = triple.get("relation", "")

        # Rule 1: Strip self-referential triples
        if subject and obj and subject.lower() == obj.lower():
            print(f"    corrected: {record_id} {relation} -> dropped (self-referential: '{subject}' == '{obj}')")
            continue

        # Rule 2: Strip triples with null/empty object
        if not obj or obj.lower() in ("null", "none", ""):
            print(f"    corrected: {record_id} {relation} -> dropped (null object)")
            continue

        # Rule 3: Validate RESOLVED against content status indicators
        if relation == "RESOLVED":
            resolved_keywords = ["status: done", "status: closed", "status: resolved"]
            is_resolved = any(kw in content.lower() for kw in resolved_keywords)
            if is_resolved:
                print(f"    checked: {record_id} RESOLVED -> KEPT (content contains status keyword)")
            else:
                # Downgrade to MENTIONED
                triple["relation"] = "MENTIONED"
                print(f"    corrected: {record_id} RESOLVED -> downgraded to MENTIONED (content doesn't indicate resolution)")

        validated.append(triple)

    return validated


def write_test_review(records: list[dict], all_triples: list[list[dict]], path: Path):
    """Write a side-by-side test review markdown file."""
    lines = [
        "# Test Review: Triple Extraction Quality",
        "",
        f"Review of **{len(records)}** records processed with Groq model `{GROQ_MODEL}`.",
        "",
        "---",
        "",
    ]

    for i, (record, triples) in enumerate(zip(records, all_triples)):
        lines.append(f"## Record {i+1}: `{record['source_id']}`")
        lines.append("")
        lines.append("### Input")
        lines.append(f"- **Source:** `{record['source_type']}`")
        lines.append(f"- **Author:** {record['author']}")
        lines.append(f"- **Timestamp:** {record['timestamp']}")
        lines.append(f"- **Content:**")
        lines.append(f"  > {record['content']}")
        lines.append("")
        lines.append("### Extracted Triples")
        if triples:
            lines.append("| # | Subject | Relation | Object |")
            lines.append("|---|---------|----------|--------|")
            for j, t in enumerate(triples, 1):
                lines.append(
                    f"| {j} | {t['subject']} | {t['relation']} | {t['object']} |"
                )
        else:
            lines.append("*(No triples extracted)*")
        lines.append("")
        lines.append("---")
        lines.append("")

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"\nTest review written to {path}")


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    load_dotenv(PROJECT_ROOT / ".env")

    api_key = os.getenv("GROK_API_KEY")
    if not api_key or api_key == "your_key_here":
        print(
            "ERROR: GROK_API_KEY not set. Copy .env.example to .env and add your key."
        )
        print(f"       cp {PROJECT_ROOT / '.env.example'} {PROJECT_ROOT / '.env'}")
        sys.exit(1)

    run_all = "--all" in sys.argv

    # Initialize OpenAI-compatible client pointed at Groq
    client = OpenAI(
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1",
    )

    # Load dataset
    records = load_dataset(DATA_PATH)
    batch = records if run_all else records[:TEST_BATCH_SIZE]
    total = len(batch)
    print(f"Processing {total} record{'s' if total != 1 else ''}...\n")

    all_triples: list[list[dict]] = []

    for idx, record in enumerate(batch, 1):
        print(f"Processing record {idx}/{total}  [{record['source_id']}]")

        triples = extract_triples(client, record)
        time.sleep(API_DELAY_SECONDS)

        all_triples.append(triples)
        print(f"  -> {len(triples)} triple(s) extracted")

    # Save all triples
    flat_triples = [t for triples in all_triples for t in triples]
    with open(TRIPLES_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(flat_triples, f, indent=2)
    print(f"\nSaved {len(flat_triples)} total triples to {TRIPLES_OUTPUT}")

    # Write test review (only for batch runs, not full runs)
    if not run_all:
        write_test_review(batch, all_triples, REVIEW_OUTPUT)

    print("\nDone.")

if __name__ == "__main__":
    main()
