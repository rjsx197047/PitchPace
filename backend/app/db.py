"""SQLite persistence layer.

Everything the athlete logs lives in a single local SQLite file so the data
survives restarts and is portable / future-proof (just copy data/pitchpace.db).
Uses the stdlib sqlite3 module — no ORM, no extra dependency.
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from app.config import DB_PATH


# ── Connection ──────────────────────────────────────────────────────────────


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Schema ──────────────────────────────────────────────────────────────────

DEFAULT_PROFILE = {
    "name": "",
    "sport_focus": "both",  # soccer | track | both
    "primary_event": "",  # e.g. "Winger" or "800m"
    "age": None,
    "height_cm": None,
    "weight_kg": None,
    "experience": "intermediate",  # beginner | intermediate | advanced
    "weekly_target": 5,
    "goals": "",
}


def init_db() -> None:
    """Create tables on first run and seed a single profile row."""
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS profile (
                id           INTEGER PRIMARY KEY CHECK (id = 1),
                name         TEXT    NOT NULL DEFAULT 'Athlete',
                sport_focus  TEXT    NOT NULL DEFAULT 'both',
                primary_event TEXT   NOT NULL DEFAULT '',
                age          INTEGER,
                height_cm    REAL,
                weight_kg    REAL,
                experience   TEXT    NOT NULL DEFAULT 'intermediate',
                weekly_target INTEGER NOT NULL DEFAULT 5,
                goals        TEXT    NOT NULL DEFAULT '',
                updated_at   TEXT    NOT NULL
            );

            CREATE TABLE IF NOT EXISTS workouts (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                date         TEXT    NOT NULL,           -- ISO date (YYYY-MM-DD)
                type         TEXT    NOT NULL,           -- workout category
                title        TEXT    NOT NULL DEFAULT '',
                duration_min REAL    NOT NULL DEFAULT 0,
                distance_mi  REAL    NOT NULL DEFAULT 0,
                intensity    INTEGER NOT NULL DEFAULT 5, -- RPE 1-10
                calories     INTEGER,
                metrics      TEXT    NOT NULL DEFAULT '{}', -- JSON: splits, reps, etc.
                notes        TEXT    NOT NULL DEFAULT '',
                created_at   TEXT    NOT NULL
            );

            CREATE TABLE IF NOT EXISTS chat_messages (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                role       TEXT NOT NULL,    -- user | assistant
                content    TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            -- Full-text index over workouts so the AI coach can retrieve
            -- relevant sessions from the athlete's entire history (RAG).
            CREATE VIRTUAL TABLE IF NOT EXISTS workouts_fts USING fts5(
                title, notes, type,
                content='workouts', content_rowid='id'
            );
            CREATE TRIGGER IF NOT EXISTS workouts_fts_ai AFTER INSERT ON workouts BEGIN
                INSERT INTO workouts_fts(rowid, title, notes, type)
                VALUES (new.id, new.title, new.notes, new.type);
            END;
            CREATE TRIGGER IF NOT EXISTS workouts_fts_ad AFTER DELETE ON workouts BEGIN
                INSERT INTO workouts_fts(workouts_fts, rowid, title, notes, type)
                VALUES ('delete', old.id, old.title, old.notes, old.type);
            END;
            CREATE TRIGGER IF NOT EXISTS workouts_fts_au AFTER UPDATE ON workouts BEGIN
                INSERT INTO workouts_fts(workouts_fts, rowid, title, notes, type)
                VALUES ('delete', old.id, old.title, old.notes, old.type);
                INSERT INTO workouts_fts(rowid, title, notes, type)
                VALUES (new.id, new.title, new.notes, new.type);
            END;
            """
        )
        # Sync the index with any rows that predate it (e.g. existing DBs).
        conn.execute("INSERT INTO workouts_fts(workouts_fts) VALUES('rebuild')")
        row = conn.execute("SELECT id FROM profile WHERE id = 1").fetchone()
        if row is None:
            conn.execute(
                """INSERT INTO profile
                   (id, name, sport_focus, primary_event, age, height_cm,
                    weight_kg, experience, weekly_target, goals, updated_at)
                   VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    DEFAULT_PROFILE["name"],
                    DEFAULT_PROFILE["sport_focus"],
                    DEFAULT_PROFILE["primary_event"],
                    DEFAULT_PROFILE["age"],
                    DEFAULT_PROFILE["height_cm"],
                    DEFAULT_PROFILE["weight_kg"],
                    DEFAULT_PROFILE["experience"],
                    DEFAULT_PROFILE["weekly_target"],
                    DEFAULT_PROFILE["goals"],
                    _now(),
                ),
            )


# ── Profile ─────────────────────────────────────────────────────────────────


def get_profile() -> dict[str, Any]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM profile WHERE id = 1").fetchone()
        return dict(row) if row else dict(DEFAULT_PROFILE)


def update_profile(data: dict[str, Any]) -> dict[str, Any]:
    fields = [
        "name",
        "sport_focus",
        "primary_event",
        "age",
        "height_cm",
        "weight_kg",
        "experience",
        "weekly_target",
        "goals",
    ]
    updates = {k: data[k] for k in fields if k in data and data[k] is not None}
    if updates:
        with get_conn() as conn:
            sets = ", ".join(f"{k} = ?" for k in updates)
            conn.execute(
                f"UPDATE profile SET {sets}, updated_at = ? WHERE id = 1",
                (*updates.values(), _now()),
            )
    return get_profile()


# ── Workouts ────────────────────────────────────────────────────────────────


def _workout_from_row(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    try:
        d["metrics"] = json.loads(d.get("metrics") or "{}")
    except (json.JSONDecodeError, TypeError):
        d["metrics"] = {}
    return d


def list_workouts(limit: int | None = None) -> list[dict[str, Any]]:
    with get_conn() as conn:
        q = "SELECT * FROM workouts ORDER BY date DESC, id DESC"
        if limit:
            q += f" LIMIT {int(limit)}"
        rows = conn.execute(q).fetchall()
        return [_workout_from_row(r) for r in rows]


def create_workout(data: dict[str, Any]) -> dict[str, Any]:
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO workouts
               (date, type, title, duration_min, distance_mi, intensity,
                calories, metrics, notes, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data["date"],
                data["type"],
                data.get("title", ""),
                float(data.get("duration_min") or 0),
                float(data.get("distance_mi") or 0),
                int(data.get("intensity") or 5),
                data.get("calories"),
                json.dumps(data.get("metrics") or {}),
                data.get("notes", ""),
                _now(),
            ),
        )
        row = conn.execute(
            "SELECT * FROM workouts WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
        return _workout_from_row(row)


def update_workout(workout_id: int, data: dict[str, Any]) -> dict[str, Any] | None:
    allowed = [
        "date",
        "type",
        "title",
        "duration_min",
        "distance_mi",
        "intensity",
        "calories",
        "notes",
    ]
    updates = {k: data[k] for k in allowed if k in data}
    with get_conn() as conn:
        if "metrics" in data:
            updates["metrics"] = json.dumps(data["metrics"] or {})
        if updates:
            sets = ", ".join(f"{k} = ?" for k in updates)
            conn.execute(
                f"UPDATE workouts SET {sets} WHERE id = ?",
                (*updates.values(), workout_id),
            )
        row = conn.execute(
            "SELECT * FROM workouts WHERE id = ?", (workout_id,)
        ).fetchone()
        return _workout_from_row(row) if row else None


def delete_workout(workout_id: int) -> bool:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM workouts WHERE id = ?", (workout_id,))
        return cur.rowcount > 0


def search_workouts(terms: list[str], limit: int = 8) -> list[dict[str, Any]]:
    """Full-text search over title/notes/type, best matches first.

    Falls back to LIKE if the FTS query can't be parsed (defensive — terms are
    already sanitised to alphanumerics by the caller).
    """
    terms = [t for t in terms if t]
    if not terms:
        return []
    match = " OR ".join(f'"{t}"*' for t in terms[:8])
    with get_conn() as conn:
        try:
            rows = conn.execute(
                """SELECT w.* FROM workouts_fts
                   JOIN workouts w ON w.id = workouts_fts.rowid
                   WHERE workouts_fts MATCH ?
                   ORDER BY rank LIMIT ?""",
                (match, limit),
            ).fetchall()
        except sqlite3.OperationalError:
            like = f"%{terms[0]}%"
            rows = conn.execute(
                """SELECT * FROM workouts
                   WHERE title LIKE ? OR notes LIKE ? OR type LIKE ?
                   ORDER BY date DESC LIMIT ?""",
                (like, like, like, limit),
            ).fetchall()
        return [_workout_from_row(r) for r in rows]


# ── Chat history ────────────────────────────────────────────────────────────


def list_chat(limit: int = 200) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM chat_messages ORDER BY id ASC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


def add_chat_message(role: str, content: str) -> dict[str, Any]:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO chat_messages (role, content, created_at) VALUES (?, ?, ?)",
            (role, content, _now()),
        )
        row = conn.execute(
            "SELECT * FROM chat_messages WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
        return dict(row)


def clear_chat() -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM chat_messages")
