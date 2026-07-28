#!/usr/bin/env python3
"""Minimal Neo4j AuraDB connection test with credential & env debugging."""

import os
import sys

# ── 1. Check .env for UTF-8 BOM ──────────────────────────────────────────────
dotenv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
dotenv_path = os.path.normpath(dotenv_path)
print(f"[BOM CHECK] Reading first 10 bytes of: {dotenv_path}")
try:
    with open(dotenv_path, "rb") as f:
        first_10 = f.read(10)
    print(f"[BOM CHECK] Raw bytes (hex): {first_10.hex()}")
    print(f"[BOM CHECK] Raw bytes (repr): {first_10!r}")
    if first_10[:3] == b"\xef\xbb\xbf":
        print("[BOM CHECK] => WARNING: UTF-8 BOM detected! This can cause issues.")
    else:
        print("[BOM CHECK] => No BOM detected. File starts clean.")
except FileNotFoundError:
    print(f"[BOM CHECK] => .env not found at {dotenv_path}")
    dotenv_path = ".env"
    print(f"[BOM CHECK] Trying cwd: {os.path.abspath(dotenv_path)}")
    try:
        with open(dotenv_path, "rb") as f:
            first_10 = f.read(10)
        print(f"[BOM CHECK] Raw bytes (hex): {first_10.hex()}")
        print(f"[BOM CHECK] Raw bytes (repr): {first_10!r}")
    except FileNotFoundError:
        print("[BOM CHECK] => .env not found in cwd either.")

# ── 2. Load .env ─────────────────────────────────────────────────────────────
from dotenv import load_dotenv
loaded_path = load_dotenv(dotenv_path, override=True)
print(f"\n[LOAD_DOTENV] Called with path: {dotenv_path}")
print(f"[LOAD_DOTENV] Returned: {loaded_path}")

for k in ["NEO4J_URI", "NEO4J_USER", "NEO4J_PASSWORD"]:
    v = os.getenv(k)
    if v:
        print(f"[LOAD_DOTENV] {k} is now set (len={len(v)})")
    else:
        print(f"[LOAD_DOTENV] {k} is NOT SET")

# ── 3. Credential debug (safe) ──────────────────────────────────────────────
uri = os.getenv("NEO4J_URI", "")
user = os.getenv("NEO4J_USER", "")
pw = os.getenv("NEO4J_PASSWORD", "")

print(f"\n[CREDENTIALS]")
print(f"  NEO4J_URI (repr):     {uri!r}")
print(f"  NEO4J_USER (repr):    {user!r}")
print(f"  NEO4J_USER len:       {len(user)}")
print(f"  NEO4J_PASSWORD len:   {len(pw)}")
if len(pw) >= 6:
    print(f"  NEO4J_PASSWORD first3: '{pw[:3]}'")
    print(f"  NEO4J_PASSWORD last3:  '{pw[-3:]}'")
else:
    print(f"  NEO4J_PASSWORD value: '{pw}' (very short)")

# ── 4. Attempt connection ───────────────────────────────────────────────────
# Use neo4j+ssc:// (encrypted, trusts self-signed certs) instead of
# neo4j+s:// (encrypted, strict cert verification). This preserves
# TLS encryption while skipping certificate chain validation.
from neo4j import GraphDatabase

ssc_uri = uri.replace("neo4j+s://", "neo4j+ssc://")
if ssc_uri == uri:
    # try bolt variants too
    ssc_uri = uri.replace("bolt+s://", "bolt+ssc://")
print(f"\n[CONNECT] Using URI: {ssc_uri}")

try:
    driver = GraphDatabase.driver(ssc_uri, auth=(user, pw))
    driver.verify_connectivity()
    print("[CONNECT] => SUCCESS! Connected to Neo4j.")
    driver.close()
except Exception as e:
    print(f"[CONNECT] => FAILED: {type(e).__name__}: {e}")

print("\n[DONE]")
