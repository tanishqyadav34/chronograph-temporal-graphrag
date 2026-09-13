"""Minimal Neo4j smoke test: connect and run RETURN 1.

Skipped unless NEO4J_URI and NEO4J_PASSWORD are configured, so `pytest`
passes offline; run with live creds in .env to exercise a real database.
"""

import os
from pathlib import Path

import pytest
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent

load_dotenv(ROOT / ".env", override=True)

URI = os.getenv("NEO4J_URI", "")
USER = os.getenv("NEO4J_USER", "neo4j")
PASSWORD = os.getenv("NEO4J_PASSWORD", "")

# Live tests are explicit opt-in (CHRONO_LIVE_NEO4J=1) AND require creds, so a
# default `pytest` run is deterministic and never depends on external infra.
LIVE_NEO4J = os.getenv("CHRONO_LIVE_NEO4J", "") == "1"

requires_neo4j = pytest.mark.skipif(
    not (LIVE_NEO4J and URI and PASSWORD),
    reason="set CHRONO_LIVE_NEO4J=1 plus NEO4J_URI/NEO4J_PASSWORD to run live Neo4j tests",
)


@requires_neo4j
def test_neo4j_smoke_return_1():
    from neo4j import GraphDatabase

    # neo4j+s:// requires strict CA verification, which fails on some Python
    # installs (no default trust store). neo4j+ssc:// keeps TLS encryption but
    # trusts self-signed certificates — AuraDB's free tier cert.
    ssc_uri = URI.replace("neo4j+s://", "neo4j+ssc://").replace("bolt+s://", "bolt+ssc://")

    driver = GraphDatabase.driver(ssc_uri, auth=(USER, PASSWORD))
    try:
        with driver.session() as session:
            record = session.run("RETURN 1 AS test").single()
            assert record is not None
            assert record["test"] == 1
    finally:
        driver.close()
