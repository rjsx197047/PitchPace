"""Quick-add: free text → workout draft via the AI parse endpoint."""

from __future__ import annotations

import json
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app import ai
from app.main import app
from app.models import WORKOUT_TYPES

client = TestClient(app)


def _fake_generate(reply_text: str, backend: str = "claude"):
    async def fake(messages, system, api_key, max_tokens=1800):
        return {"text": reply_text, "backend": backend}

    return fake


def test_parse_text_endpoint(monkeypatch):
    reply = """```json
    {"date": "2026-06-10", "type": "Sprint / Track Session",
     "title": "6x400m @ 70s", "duration_min": 50, "distance_mi": 1.5,
     "intensity": 8, "calories": null,
     "metrics": {"reps": 6, "rep_distance_m": 400, "rest_s": 120},
     "notes": "felt strong"}
    ```"""
    monkeypatch.setattr(ai, "generate", _fake_generate(reply))

    resp = client.post("/api/workouts/parse-text", json={"text": "6x400 at 70 seconds"})
    assert resp.status_code == 200, resp.text
    w = resp.json()["workout"]
    assert w["type"] == "Sprint / Track Session"
    assert w["duration_min"] == 50
    assert w["metrics"]["reps"] == 6
    assert resp.json()["backend"] == "claude"


def test_parse_text_no_ai_backend(monkeypatch):
    monkeypatch.setattr(ai, "generate", _fake_generate("offline", backend="none"))
    resp = client.post("/api/workouts/parse-text", json={"text": "ran 5 miles"})
    assert resp.status_code == 503


def test_parse_text_unparseable_reply(monkeypatch):
    monkeypatch.setattr(ai, "generate", _fake_generate("Sorry, I can't help."))
    resp = client.post("/api/workouts/parse-text", json={"text": "blah"})
    assert resp.status_code == 422


def test_parse_text_empty_input():
    resp = client.post("/api/workouts/parse-text", json={"text": "   "})
    assert resp.status_code == 400


def test_extract_workout_json_coercion():
    raw = json.dumps(
        {
            "date": "not-a-date",
            "type": "boxing",  # fuzzy, lowercase
            "title": "Pads",
            "duration_min": "30",
            "distance_mi": None,
            "intensity": 14,  # clamped to 10
            "calories": 0,
            "metrics": {"rounds": 8, "bad": {"nested": True}},
            "notes": "",
        }
    )
    draft = ai.extract_workout_json(raw, WORKOUT_TYPES)
    assert draft["type"] == "Boxing"
    assert draft["date"] == date.today().isoformat()
    assert draft["duration_min"] == 30
    assert draft["intensity"] == 10
    assert draft["calories"] is None
    assert draft["metrics"] == {"rounds": 8}  # nested objects dropped


def test_extract_workout_json_garbage():
    assert ai.extract_workout_json("no json here", WORKOUT_TYPES) is None
    assert ai.extract_workout_json("[1, 2, 3]", WORKOUT_TYPES) is None
