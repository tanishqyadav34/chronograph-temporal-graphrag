"""Pytest suite for ingestion/ingest_to_neo4j.py — node classification, no DB.

All functions tested here are pure (classify_node, normalize_name,
TICKET_PATTERN), so the suite runs fully offline with no Neo4j instance.
"""

import ingest_to_neo4j as ing

import pytest


class TestClassifyNode:
    def test_known_people_are_person(self):
        for person in ("Alice", "Bob", "Charlie", "Dave", "Eve"):
            assert ing.classify_node(person) == "Person"

    def test_case_sensitive_person_match(self):
        # Only exact known names are People.
        assert ing.classify_node("alice") != "Person"

    def test_ticket_ids_are_ticket(self):
        assert ing.classify_node("CHRONO-109") == "Ticket"

    def test_ticket_prefix_is_still_ticket(self):
        assert ing.classify_node("Ticket CHRONO-109") == "Ticket"

    def test_technologies_are_technology(self):
        for tech in ("GCP", "AWS", "PostgreSQL", "Terraform", "database migration"):
            assert ing.classify_node(tech) == "Technology"


class TestNormalizeName:
    def test_plain_names_pass_through(self):
        assert ing.normalize_name("Alice") == "Alice"
        assert ing.normalize_name("GCP") == "GCP"

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("CHRONO-109", "CHRONO-109"),
            ("Ticket CHRONO-109", "CHRONO-109"),
            ("ticket chrono-109", "CHRONO-109"),  # case-insensitive prefix + id uppercased
        ],
    )
    def test_ticket_normalization(self, raw, expected):
        assert ing.normalize_name(raw) == expected

    def test_person_with_ticket_prefix_still_person_after_normalize(self):
        # A person name never carries the ticket prefix, so classification
        # happens on the normalized name in ingest().
        assert ing.classify_node(ing.normalize_name("Ticket CHRONO-109")) == "Ticket"


class TestTicketPattern:
    def test_fullmatch_semantics(self):
        assert ing.TICKET_PATTERN.fullmatch("CHRONO-109")
        assert not ing.TICKET_PATTERN.fullmatch("CHRONO-")

    def test_matches_embedded_ids_with_search(self):
        m = ing.TICKET_PATTERN.search("Work on Ticket CHRONO-109 is done")
        assert m and m.group(1) == "CHRONO-109"
