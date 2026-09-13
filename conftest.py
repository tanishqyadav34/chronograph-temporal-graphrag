"""Pytest conftest: make extraction/ and ingestion/ script modules importable.

Both directories contain top-level scripts (not packages), so tests import
them directly after adding their paths to sys.path.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

for subdir in ("extraction", "ingestion"):
    path = str(ROOT / subdir)
    if path not in sys.path:
        sys.path.insert(0, path)
