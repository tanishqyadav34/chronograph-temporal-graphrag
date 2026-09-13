"""Integration tests for the live Neo4j connection.

Previously a manual debug script (prints + no assertions). Now a pytest
module with real assertions. Live-connection tests are skipped unless
NEO4J_URI and NEO4J_PASSWORD are set (via .env or the environment), so the
suite still runs fully offline in CI.
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


def test_env_vars_present_or_skipped():
    """Report clearly what is missing instead of failing on a fresh clone."""
    if not (URI and PASSWORD):
        pytest.skip("NEO4J_URI / NEO4J_PASSWORD not set (offline run)")
    assert URI.startswith(("bolt", "neo4j")), f"unexpected NEO4J_URI scheme: {URI}"


def test_env_file_has_no_utf8_bom():
    """A UTF-8 BOM in .env breaks dotenv parsing — regression guard."""
    env_path = ROOT / ".env"
    if not env_path.exists():
        pytest.skip(".env not present (fresh clone / CI)")
    first_bytes = env_path.read_bytes()[:3]
    assert first_bytes != b"\xef\xbb\xbf", (
        ".env starts with a UTF-8 BOM; re-save it without BOM or dotenv parsing breaks"
    )


@requires_neo4j
def test_neo4j_accepts_encrypted_connection():
    """neo4j+s:// needs strict CA verification; +ssc:// keeps TLS but trusts
    self-signed certs (AuraDB free tier). Assert a real RETURN 1 round-trip."""
    from neo4j import GraphDatabase

    ssc_uri = URI.replace("neo4j+s://", "neo4j+ssc://").replace("bolt+s://", "bolt+ssc://")
    driver = GraphDatabase.driver(ssc_uri, auth=(USER, PASSWORD))
    try:
        driver.verify_connectivity()
        with driver.session() as session:
            record = session.run("RETURN 1 AS one").single()
            assert record is not None
            assert record["one"] == 1
    finally:
        driver.close()
