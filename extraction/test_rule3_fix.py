"""Pytest suite for the Rule 3 (RESOLVED) source-type-aware validation.

Covers:
- Jira records with "Status: Done/Closed/Resolved" keep RESOLVED
- Jira records without a Done/Closed/Resolved status are downgraded to MENTIONED
- Slack/Git records with natural-language completion signals keep RESOLVED
- Slack/Git records without completion signals are downgraded to MENTIONED
"""

import extract_triples as et

import pytest


def _resolved_triple(source_id: str, subject: str, obj: str) -> dict:
    return {
        "subject": subject,
        "relation": "RESOLVED",
        "object": obj,
        "timestamp": "2023-01-01T00:00:00+00:00",
        "source_id": source_id,
    }


# ── Jira: strict "Status: Done/Closed/Resolved" field ──────────────────────

JIRA_DONE_RECORDS = [
    {
        "source_id": "rec_019",
        "source_type": "jira",
        "author": "Bob",
        "content": "Ticket CHRONO-104: 'Measure Network Latency' | Status: Done | Assignee: Bob",
    },
    {
        "source_id": "rec_021",
        "source_type": "jira",
        "author": "Alice",
        "content": "Ticket CHRONO-108: 'Document GKE container registry' | Status: Done | Assignee: Charlie",
    },
    {
        "source_id": "rec_023",
        "source_type": "jira",
        "author": "Charlie",
        "content": "Ticket CHRONO-103: 'Create GCP POC Project' | Status: Done | Assignee: Charlie",
    },
    {
        "source_id": "rec_024",
        "source_type": "jira",
        "author": "Alice",
        "content": "Ticket CHRONO-105: 'Hold Architecture Review' | Status: Done | Assignee: Bob",
    },
]


@pytest.mark.parametrize("record", JIRA_DONE_RECORDS, ids=lambda r: r["source_id"])
def test_jira_status_done_keeps_resolved(record):
    triple = _resolved_triple(record["source_id"], record["author"], "Task")
    validated = et.validate_triples([triple], record)
    assert len(validated) == 1
    assert validated[0]["relation"] == "RESOLVED"


def test_jira_status_in_progress_downgrades_to_mentioned():
    record = {
        "source_id": "rec_002",
        "source_type": "jira",
        "author": "Alice",
        "content": "Ticket CHRONO-102: 'Assess Database Migration Risk' | Status: In Progress | Assignee: Bob",
    }
    triple = _resolved_triple("rec_002", "Alice", "Task")
    validated = et.validate_triples([triple], record)
    assert len(validated) == 1
    assert validated[0]["relation"] == "MENTIONED"


# ── Slack/Git: natural-language completion signals ─────────────────────────

def test_slack_completion_signals_keep_resolved():
    record = {
        "source_id": "rec_061",
        "source_type": "slack",
        "author": "Bob",
        "content": (
            "Database cutover complete. Cloud SQL PostgreSQL instance "
            "promoted to primary. I see zero errors in the web logs."
        ),
    }
    triple = _resolved_triple("rec_061", "Bob", "database migration")
    validated = et.validate_triples([triple], record)
    assert len(validated) == 1
    assert validated[0]["relation"] == "RESOLVED"


def test_slack_100_percent_signal_keeps_resolved():
    record = {
        "source_id": "rec_062",
        "source_type": "slack",
        "author": "Alice",
        "content": (
            "Congratulations team! We are officially 100% on GCP now. "
            "AWS migration is fully resolved! GCP rocks. Code base cleanup next."
        ),
    }
    triple = _resolved_triple("rec_062", "Alice", "AWS migration")
    validated = et.validate_triples([triple], record)
    assert len(validated) == 1
    assert validated[0]["relation"] == "RESOLVED"


def test_slack_without_signals_downgrades_to_mentioned():
    record = {
        "source_id": "rec_070",
        "source_type": "slack",
        "author": "Eve",
        "content": "Kicking off the database migration planning today. Will keep everyone posted.",
    }
    triple = _resolved_triple("rec_070", "Eve", "database migration")
    validated = et.validate_triples([triple], record)
    assert len(validated) == 1
    assert validated[0]["relation"] == "MENTIONED"


# ── Rules 1 & 2: self-referential and null-object stripping ────────────────

def test_self_referential_triple_is_dropped():
    record = {
        "source_id": "rec_080",
        "source_type": "slack",
        "author": "Bob",
        "content": "Bob discussed GCP.",
    }
    triple = {"subject": "Bob", "relation": "MENTIONED", "object": "Bob",
              "timestamp": "2023-01-01T00:00:00+00:00", "source_id": "rec_080"}
    assert et.validate_triples([triple], record) == []


def test_null_object_triple_is_dropped():
    record = {
        "source_id": "rec_081",
        "source_type": "git",
        "author": "Charlie",
        "content": "commit: fix auth flow",
    }
    for bad_object in ("", "null", "None"):
        triple = {"subject": "Charlie", "relation": "COMMITTED_CODE", "object": bad_object,
                  "timestamp": "2023-01-01T00:00:00+00:00", "source_id": "rec_081"}
        assert et.validate_triples([triple], record) == [], f"object={bad_object!r} should be dropped"


def test_valid_triples_pass_through():
    record = {
        "source_id": "rec_082",
        "source_type": "git",
        "author": "Dave",
        "content": "commit: migrate database to GCP",
    }
    triple = {"subject": "Dave", "relation": "COMMITTED_CODE", "object": "GCP",
              "timestamp": "2023-01-01T00:00:00+00:00", "source_id": "rec_082"}
    validated = et.validate_triples([triple], record)
    assert validated == [triple]
