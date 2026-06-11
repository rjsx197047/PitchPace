"""Test bootstrap: point the app at a throwaway database before importing it.

PITCHPACE_DATA_DIR must be set before `app.config` is imported (it resolves
DB_PATH at import time), so this happens at module top-level.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
os.environ["PITCHPACE_DATA_DIR"] = tempfile.mkdtemp(prefix="pitchpace-test-")

import pytest  # noqa: E402

from app import db  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    """Every test starts with empty tables (the FTS index follows via triggers)."""
    db.init_db()
    yield
    with db.get_conn() as conn:
        conn.execute("DELETE FROM workouts")
        conn.execute("DELETE FROM chat_messages")
