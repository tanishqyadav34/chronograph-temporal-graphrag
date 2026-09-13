"""Pytest suite for extraction/extract_triples.py — pure functions, no network.

Covers batch-message building and batch response parsing (valid / malformed /
truncated / unknown source_ids).
"""

import json

import extract_triples as et

import pytest


# ── build_batch_user_message ────────────────────────────────────────────────

def _record(rid: str, source_type: str = "slack", author: str = "Alice",
            content: str = "hello world", timestamp: str = "2023-01-01T00:00:00Z") -> dict:
    return {
        "source_id": rid,
        "source_type": source_type,
        "author": author,
        "content": content,
        "timestamp": timestamp,
    }


def test_batch_message_contains_all_record_ids():
    records = [_record("rec_001"), _record("rec_002"), _record("rec_003")]
    msg = et.build_batch_user_message(records)
    assert "rec_001" in msg
    assert "rec_002" in msg
    assert "rec_003" in msg
    assert "3 records" in msg


def test_batch_message_includes_content_and_metadata():
    records = [_record("rec_001", source_type="git", author="Bob", content="feat: add CI")]
    msg = et.build_batch_user_message(records)
    assert "source_type: git" in msg
    assert "author: Bob" in msg
    assert "feat: add CI" in msg
    assert "--- BEGIN RECORD rec_001" in msg
    assert "--- END RECORD rec_001 ---" in msg


def test_batch_message_orders_records_with_indices():
    records = [_record("rec_001"), _record("rec_002")]
    msg = et.build_batch_user_message(records)
    assert msg.index("record 1 of 2") < msg.index("record 2 of 2")


# ── parse_batch_response ────────────────────────────────────────────────────

def test_parses_valid_batch_response():
    raw = json.dumps({
        "triples": [
            {"subject": "Alice", "relation": "ADVOCATED_FOR", "object": "GCP",
             "timestamp": "2023-01-01T00:00:00Z", "source_id": "rec_001"},
            {"subject": "Bob", "relation": "COMMITTED_CODE", "object": "Terraform",
             "timestamp": "2023-01-02T00:00:00Z", "source_id": "rec_002"},
        ]
    })
    result = et.parse_batch_response(raw, {"rec_001", "rec_002"})
    assert result is not None
    assert set(result.keys()) == {"rec_001", "rec_002"}
    assert result["rec_001"][0]["object"] == "GCP"


def test_rejects_empty_response():
    assert et.parse_batch_response("", {"rec_001"}) is None
    assert et.parse_batch_response("   \n  ", {"rec_001"}) is None


def test_rejects_truncated_response():
    # Ends mid-JSON (no closing brace) → treated as truncated.
    raw = '{"triples": [{"subject": "Alice"'
    assert et.parse_batch_response(raw, {"rec_001"}) is None


def test_rejects_malformed_json():
    assert et.parse_batch_response("{not valid json}", {"rec_001"}) is None


def test_rejects_non_list_triples_field():
    raw = json.dumps({"triples": "oops"})
    assert et.parse_batch_response(raw, {"rec_001"}) is None


def test_skips_unknown_source_ids():
    raw = json.dumps({
        "triples": [
            {"subject": "Alice", "relation": "MENTIONED", "object": "GCP",
             "timestamp": "2023-01-01T00:00:00Z", "source_id": "rec_999"},
            {"subject": "Bob", "relation": "MENTIONED", "object": "AWS",
             "timestamp": "2023-01-01T00:00:00Z", "source_id": "rec_001"},
        ]
    })
    result = et.parse_batch_response(raw, {"rec_001"})
    assert result is not None
    assert set(result.keys()) == {"rec_001"}
    assert len(result["rec_001"]) == 1


def test_groups_multiple_triples_per_source_id():
    raw = json.dumps({
        "triples": [
            {"subject": "Alice", "relation": "MENTIONED", "object": "GCP",
             "timestamp": "t", "source_id": "rec_001"},
            {"subject": "Alice", "relation": "ADVOCATED_FOR", "object": "GCP",
             "timestamp": "t", "source_id": "rec_001"},
        ]
    })
    result = et.parse_batch_response(raw, {"rec_001"})
    assert len(result["rec_001"]) == 2
