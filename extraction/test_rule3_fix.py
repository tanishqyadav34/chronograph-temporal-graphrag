#!/usr/bin/env python3
"""test_rule3_fix.py -- Verify Rule 3 (RESOLVED) fix with source-type-aware detection.

Tests 7 specific records:
- rec_061 (Slack, Bob): KEEP RESOLVED (natural language completion signals)
- rec_062 (Slack, Alice): KEEP RESOLVED (natural language completion signals)
- rec_019 (Jira, Done): KEEP RESOLVED (Status: Done)
- rec_021 (Jira, Done): KEEP RESOLVED (Status: Done)
- rec_023 (Jira, Done): KEEP RESOLVED (Status: Done)
- rec_024 (Jira, Done): KEEP RESOLVED (Status: Done)
- rec_002 (Jira, In Progress): DOWNGRADE RESOLVED (Status: In Progress)
"""

import sys
import io
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_triples import validate_triples, NL_RESOLVED_SIGNALS

TEST_RECORDS = [
    {
        "source_id": "rec_061",
        "source_type": "slack",
        "author": "Bob",
        "content": ("Database cutover complete. Cloud SQL PostgreSQL instance "
                     "promoted to primary. I see zero errors in the web logs."),
        "expected": "KEPT",
    },
    {
        "source_id": "rec_062",
        "source_type": "slack",
        "author": "Alice",
        "content": ("Congratulations team! We are officially 100% on GCP now. "
                     "AWS migration is fully resolved! GCP rocks. Code base cleanup next."),
        "expected": "KEPT",
    },
    {
        "source_id": "rec_019",
        "source_type": "jira",
        "author": "Bob",
        "content": ("Ticket CHRONO-104: 'Measure Network Latency' | "
                     "Status: Done | Assignee: Bob"),
        "expected": "KEPT",
    },
    {
        "source_id": "rec_021",
        "source_type": "jira",
        "author": "Alice",
        "content": ("Ticket CHRONO-108: 'Document GKE container registry' | "
                     "Status: Done | Assignee: Charlie"),
        "expected": "KEPT",
    },
    {
        "source_id": "rec_023",
        "source_type": "jira",
        "author": "Charlie",
        "content": ("Ticket CHRONO-103: 'Create GCP POC Project' | "
                     "Status: Done | Assignee: Charlie"),
        "expected": "KEPT",
    },
    {
        "source_id": "rec_024",
        "source_type": "jira",
        "author": "Alice",
        "content": ("Ticket CHRONO-105: 'Hold Architecture Review' | "
                     "Status: Done | Assignee: Bob"),
        "expected": "KEPT",
    },
    {
        "source_id": "rec_002",
        "source_type": "jira",
        "author": "Alice",
        "content": ("Ticket CHRONO-102: 'Assess Database Migration Risk' | "
                     "Status: In Progress | Assignee: Bob"),
        "expected": "DOWNGRADED",
    },
]


def main():
    print("=" * 72)
    print("Rule 3 Fix Verification - Source-Aware RESOLVED Detection")
    print("=" * 72)
    print()
    print(f"Natural-language signals ({len(NL_RESOLVED_SIGNALS)}):")
    for s in NL_RESOLVED_SIGNALS:
        print(f'  - "{s}"')
    print()

    all_pass = True

    for rec in TEST_RECORDS:
        rid = rec["source_id"]
        obj = rec["content"].split("'")[1] if "'" in rec["content"] else "Task"
        triple = {
            "subject": rec["author"],
            "relation": "RESOLVED",
            "object": obj,
            "timestamp": "2023-01-01T00:00:00+00:00",
            "source_id": rid,
        }

        f = io.StringIO()
        with redirect_stdout(f):
            validated = validate_triples([triple], rec)
        log = f.getvalue().strip()

        if validated and validated[0]["relation"] == "RESOLVED":
            result = "KEPT"
        else:
            result = "DOWNGRADED"
        passed = result == rec["expected"]

        status = "PASS" if passed else "FAIL"
        sig = "+" if passed else "X"
        print(f"[{sig}] {rid} ({rec['source_type']:5s}, {rec['author']:7s}) "
              f"-> {result:11s}  (expected: {rec['expected']:11s})")
        if log:
            print(f"     {log}")
        if not passed:
            all_pass = False
        print()

    print("=" * 72)
    if all_pass:
        print("ALL CHECKS PASSED - Rule 3 fix verified!")
    else:
        print("SOME CHECKS FAILED - investigate above.")
    print("=" * 72)

    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
