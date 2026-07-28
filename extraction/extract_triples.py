#!/usr/bin/env python3
"""
extract_triples.py — Task 2: Extraction Pipeline

Reads mock_dataset.json, sends records in batches to the Groq API
to extract relationship triples, and outputs the results.

Batch mode groups records (default 10 per batch) to reduce API calls.
Each batch response is parsed by source_id, then per-record validation
rules (self-referential, null-object, RESOLVED cross-check) are applied.

Usage:
    python extraction/extract_triples.py            # run on first 20 records (2 batches)
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

# Batch processing settings
BATCH_SIZE = 10

# Test batch size (for non --all runs): first 2 batches = 20 records
TEST_BATCH_SIZE = 20

# Delay between API calls (seconds) to avoid rate limiting
API_DELAY_SECONDS = 0.5

# Retry settings for rate-limited API calls
RETRY_MAX_ATTEMPTS = 3
RETRY_BASE_DELAY = 1.0  # seconds; doubles each retry (1s, 2s, 4s)

# ── System prompt for Groq ────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a knowledge graph extraction assistant for enterprise communication data.

Given a message from Slack, a Git commit, or a Jira ticket, extract all relevant relationship triples from the content.

Each triple must have exactly these fields:
- "subject": the entity performing the action (person name, team, or technology)
- "relation": exactly one of ADVOCATED_FOR, ARGUED_AGAINST, COMMITTED_CODE, ASSIGNED_TO, RESOLVED, MENTIONED
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
If no triples can be extracted, return {"triples": []}."""


# ── Helpers ────────────────────────────────────────────────────────────────


def load_dataset(path: Path) -> list[dict]:
    """Load the mock dataset from JSON."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    print(f"Loaded {len(data)} records from {path}")
    return data


def build_single_user_message(record: dict) -> str:
    """Build the user message for a single record (used in fallback mode)."""
    parts = [
        f"source_type: {record['source_type']}",
        f"author: {record['author']}",
        f"content: {record['content']}",
        f"source_id: {record['source_id']}",
        f"timestamp: {record['timestamp']}",
    ]
    return "\n".join(parts)


def build_batch_user_message(records: list[dict]) -> str:
    """Build the user message for a batch of records.

    Each record is clearly delimited with BEGIN/END markers and its source_id
    so the model can produce triples tagged with the correct source_id.
    """
    sections = [
        f"You are given {len(records)} records below. For each record, extract all relevant relationship triples.",
        "",
        "Each triple MUST include the correct \"source_id\" field matching the record it came from.",
        "Every triple you return must have the source_id set to one of the IDs shown in the BEGIN markers below.",
        "",
        "Records:",
    ]
    for i, record in enumerate(records, 1):
        rid = record["source_id"]
        sections.append("")
        sections.append(f"--- BEGIN RECORD {rid} (record {i} of {len(records)}) ---")
        sections.append(f"source_type: {record['source_type']}")
        sections.append(f"author: {record['author']}")
        sections.append(f"content: {record['content']}")
        sections.append(f"timestamp: {record['timestamp']}")
        sections.append(f"--- END RECORD {rid} ---")

    sections.append("")
    sections.append(
        f'Return a JSON object with key "triples" containing an array of all triples '
        f"from all {len(records)} records. Each triple MUST have its correct source_id."
    )
    return "\n".join(sections)


def call_api_with_retry(client: OpenAI, messages: list[dict], label: str) -> str | None:
    """Call the Groq API with retry logic.

    Returns the raw response content string on success, or None on failure.
    Handles rate-limit errors with exponential backoff.
    """
    for attempt in range(1, RETRY_MAX_ATTEMPTS + 1):
        try:
            response = client.chat.completions.create(
                model=GROQ_MODEL,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=0.0,
            )

            raw = response.choices[0].message.content

            if attempt > 1:
                print(f"    retry {label}: succeeded on attempt {attempt}")

            return raw

        except Exception as e:
            error_str = str(e)
            is_rate_limit = "429" in error_str or "rate limit" in error_str.lower()

            if is_rate_limit and attempt < RETRY_MAX_ATTEMPTS:
                delay = RETRY_BASE_DELAY * (2 ** (attempt - 1))
                print(f"    retry {label}: rate limited (attempt {attempt}/{RETRY_MAX_ATTEMPTS}), waiting {delay}s...")
                time.sleep(delay)
                continue  # try next attempt

            if attempt > 1:
                print(f"    retry {label}: failed after {attempt} attempts: {e}")
            else:
                print(f"    [!] {label}: API error: {e}")
            return None

    return None


def parse_batch_response(raw: str, expected_ids: set[str]) -> dict[str, list[dict]] | None:
    """Parse the batch API response into a dict of source_id -> list of triples.

    Returns None if the response is malformed (not valid JSON) or appears
    truncated (doesn't end with proper closing of the triples array).
    """
    if not raw or not raw.strip():
        print("    [!] Batch response is empty")
        return None

    # Check for truncation: the response should end with "}" after the triples array
    stripped = raw.strip()
    if not stripped.endswith("}"):
        print("    [!] Batch response appears truncated (doesn't end with '}')")
        return None

    # Try to parse JSON
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError as e:
        print(f"    [!] Batch response is malformed JSON: {e}")
        return None

    triples = parsed.get("triples", [])
    if not isinstance(triples, list):
        print(f"    [!] Batch response has non-list 'triples' field: {type(triples).__name__}")
        return None

    # Group triples by source_id
    result: dict[str, list[dict]] = {}
    for triple in triples:
        sid = triple.get("source_id", "")
        if sid not in expected_ids:
            # Source_id from model doesn't match any expected record — log and skip
            print(f"    [!] Batch response has unexpected source_id '{sid}', skipping triple")
            continue
        if sid not in result:
            result[sid] = []
        result[sid].append(triple)

    return result


def extract_triples_single(client: OpenAI, record: dict) -> list[dict]:
    """Call the Groq API to extract triples from a single record.

    Used as fallback when batch processing fails or produces a malformed response.
    """
    user_msg = build_single_user_message(record)
    record_id = record["source_id"]

    raw = call_api_with_retry(
        client,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        label=record_id,
    )

    if raw is None:
        return []

    # Parse JSON
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        print(f"    [!] {record_id}: JSON parse error after API call")
        return []

    triples = parsed.get("triples", [])

    # Return raw triples — enrichment and validation happen in the main loop
    # for ALL paths (batch and fallback) uniformly.
    return triples


def extract_triples_batch(client: OpenAI, records: list[dict]) -> dict[str, list[dict]]:
    """Call the Groq API to extract triples from a batch of records.

    Returns a dict mapping each record's source_id to its list of extracted triples.
    If the batch response is malformed or truncated, falls back to calling
    extract_triples_single for each record individually.
    """
    n = len(records)
    expected_ids = {r["source_id"] for r in records}

    # Build the batch message
    batch_msg = build_batch_user_message(records)
    batch_label = f"batch [{', '.join(r['source_id'] for r in records)}]"

    raw = call_api_with_retry(
        client,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": batch_msg},
        ],
        label=batch_label,
    )

    if raw is None:
        print(f"    -> API call failed for batch, falling back to one-by-one...")
        return _fallback_one_by_one(client, records)

    # Parse and validate the batch response
    result = parse_batch_response(raw, expected_ids)

    if result is None:
        print(f"    -> Batch response invalid, falling back to one-by-one...")
        return _fallback_one_by_one(client, records)

    # Optional: check if too few source_ids were returned relative to batch size
    found_ids = set(result.keys())
    if len(found_ids) < len(expected_ids):
        missing = expected_ids - found_ids
        # Only flag as problematic if more than half the records are missing
        if len(missing) > n // 2:
            print(f"    [!] Batch response only covers {len(found_ids)}/{n} records (missing: {', '.join(sorted(missing))}), falling back to one-by-one...")
            return _fallback_one_by_one(client, records)
        else:
            # A few records with no triples is expected — log for transparency
            print(f"    Note: {len(missing)} record(s) had no triples in batch response: {', '.join(sorted(missing))}")

    return result


def _fallback_one_by_one(client: OpenAI, records: list[dict]) -> dict[str, list[dict]]:
    """Fallback: process records one at a time when batch processing fails."""
    result: dict[str, list[dict]] = {}
    for record in records:
        rid = record["source_id"]
        print(f"    Fallback processing {rid}...")
        triples = extract_triples_single(client, record)
        result[rid] = triples
        time.sleep(API_DELAY_SECONDS)
    return result


# Natural-language resolution signals for Slack and Git content (no Status: field)
NL_RESOLVED_SIGNALS: list[str] = [
    "complete.",       # "cutover complete.", "sync complete."
    "completed",       # "completed successfully", "database sync completed"
    "fully resolved",  # "migration is fully resolved"
    "fully migrated",  # "fully migrated to GCP"
    "promoted to",     # "promoted to primary"
    "zero errors",     # "I see zero errors in the web logs"
    "100%",            # "100% on GCP"
    "finalized",       # "We finalized deleting the AWS resources"
    "successfully",    # "completed successfully", "passed successfully"
    "fully operational",  # "fully operational"
    "all done",        # "All done"
    "switchover",      # "switchover", "switchover sequence"
]


def _is_resolved_jira(content: str) -> bool:
    """Check Jira-formatted content for explicit Status: Done/Closed/Resolved."""
    keywords = ["status: done", "status: closed", "status: resolved"]
    return any(kw in content.lower() for kw in keywords)


def _is_resolved_nl(content: str) -> bool:
    """Check Slack/Git content for natural-language completion signals.

    Looks for words/phrases like 'complete', 'resolved', 'completed',
    'promoted to primary', 'zero errors', '100%', etc.
    """
    lower = content.lower()
    for signal in NL_RESOLVED_SIGNALS:
        if signal in lower:
            return True
    return False


def validate_triples(triples: list[dict], record: dict) -> list[dict]:
    """Apply post-processing filters to clean extracted triples.

    Rules:
    1. Strip self-referential triples (subject == object)
    2. Strip triples where object is null, None, empty, or "null"
    3. Validate RESOLVED: source-type-aware check.
       - Jira: strict "Status: Done/Closed/Resolved" field required
       - Slack/Git: natural-language completion signals
       Downgrade to MENTIONED if not resolved.
    """
    validated: list[dict] = []
    record_id = record["source_id"]
    content = record.get("content", "")
    source_type = record.get("source_type", "")

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
            if source_type == "jira":
                is_resolved = _is_resolved_jira(content)
                reason = "content contains 'Status: Done/Closed/Resolved' field" if is_resolved else "content lacks 'Status: Done/Closed/Resolved' field"
            else:
                is_resolved = _is_resolved_nl(content)
                reason = "content contains natural-language completion signal" if is_resolved else "content lacks completion signal"

            if is_resolved:
                print(f"    checked: {record_id} RESOLVED -> KEPT ({reason})")
            else:
                triple["relation"] = "MENTIONED"
                print(f"    corrected: {record_id} RESOLVED -> downgraded to MENTIONED ({reason})")

        validated.append(triple)

    return validated


def write_test_review(records: list[dict], all_triples: list[list[dict]], path: Path):
    """Write a side-by-side test review markdown file."""
    lines = [
        "# Test Review: Triple Extraction Quality",
        "",
        f"Review of **{len(records)}** records processed with Groq model `{GROQ_MODEL}`.",
        f"Processed in batches of **{BATCH_SIZE}** records per API call.",
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

    # Load dataset and determine scope
    records = load_dataset(DATA_PATH)
    scope = records if run_all else records[:TEST_BATCH_SIZE]
    total = len(scope)
    print(f"Processing {total} record{'s' if total != 1 else ''} in batches of {BATCH_SIZE}...\n")

    all_triples: list[list[dict]] = []
    num_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE

    for batch_idx in range(0, total, BATCH_SIZE):
        batch_records = scope[batch_idx:batch_idx + BATCH_SIZE]
        batch_num = batch_idx // BATCH_SIZE + 1
        start_idx = batch_idx + 1
        end_idx = min(batch_idx + BATCH_SIZE, total)

        print(f"--- Batch {batch_num}/{num_batches} (records {start_idx}-{end_idx}) ---")

        # Extract triples via batch API call (with fallback to one-by-one)
        triples_by_id = extract_triples_batch(client, batch_records)

        # Collect and validate per-record
        for record in batch_records:
            rid = record["source_id"]
            triples = triples_by_id.get(rid, [])

            # Enrich with record metadata (override whatever the model returned)
            for triple in triples:
                triple["timestamp"] = record["timestamp"]
                triple["source_id"] = rid
                if triple.get("relation") not in VALID_RELATIONS:
                    triple["relation"] = "MENTIONED"

            # Apply per-record validation rules
            triples = validate_triples(triples, record)
            all_triples.append(triples)
            print(f"  {rid}: {len(triples)} triple(s)")

        # Checkpoint: save progress after each batch
        flat_triples = [t for triples in all_triples for t in triples]
        with open(TRIPLES_OUTPUT, "w", encoding="utf-8") as f:
            json.dump(flat_triples, f, indent=2)
        print(f"  -> Checkpoint saved ({len(flat_triples)} triples so far)")

        # Small delay between batches
        if batch_idx + BATCH_SIZE < total:
            time.sleep(API_DELAY_SECONDS)

    # Final summary
    flat_triples = [t for triples in all_triples for t in triples]
    print(f"\n{'='*50}")
    print(f"Done. Saved {len(flat_triples)} total triples to {TRIPLES_OUTPUT}")

    # Write test review (only for batch runs, not full runs)
    if not run_all:
        write_test_review(scope, all_triples, REVIEW_OUTPUT)

    print("Done.")


if __name__ == "__main__":
    main()
