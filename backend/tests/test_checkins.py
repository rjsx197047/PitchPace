"""Readiness check-ins: scoring maths, upsert semantics, endpoints, AI context."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app import db, readiness
from app.main import app

client = TestClient(app)


def _checkin(**overrides):
    base = {
        "sleep_h": 8,
        "sleep_quality": 5,
        "energy": 5,
        "soreness": 1,
        "sore_areas": [],
        "resting_hr": None,
        "hrv_ms": None,
        "notes": "",
    }
    base.update(overrides)
    return base


def test_readiness_score_extremes():
    perfect = readiness.readiness(_checkin())
    assert perfect["score"] == 100
    assert perfect["status"] == "primed"

    wrecked = readiness.readiness(
        _checkin(sleep_h=3, sleep_quality=1, energy=1, soreness=5)
    )
    assert wrecked["score"] < 40
    assert wrecked["status"] == "rest-day"


def test_status_thresholds():
    assert readiness.status_for(80) == "primed"
    assert readiness.status_for(79) == "ready"
    assert readiness.status_for(60) == "ready"
    assert readiness.status_for(59) == "caution"
    assert readiness.status_for(39) == "rest-day"


def test_hrv_below_baseline_drags_score_down():
    base_inputs = _checkin(sleep_h=7, sleep_quality=4, energy=4, soreness=2)
    without_hrv = readiness.readiness(base_inputs)["score"]
    suppressed = readiness.readiness({**base_inputs, "hrv_ms": 40}, baseline_hrv=60)
    boosted = readiness.readiness({**base_inputs, "hrv_ms": 75}, baseline_hrv=60)
    assert suppressed["score"] < without_hrv < boosted["score"]


def test_checkin_upsert_one_row_per_day():
    today = date.today().isoformat()
    first = client.post("/api/checkin", json={"sleep_h": 6, "soreness": 4}).json()
    assert first["date"] == today
    assert first["readiness"]["score"] > 0

    second = client.post(
        "/api/checkin", json={"sleep_h": 8.5, "sleep_quality": 5, "energy": 5}
    ).json()
    assert second["sleep_h"] == 8.5

    listed = client.get("/api/checkins").json()["checkins"]
    assert len(listed) == 1  # replaced, not duplicated

    today_resp = client.get("/api/checkin/today").json()
    assert today_resp["checkin"]["sleep_h"] == 8.5
    assert "readiness" in today_resp["checkin"]


def test_checkin_today_empty():
    assert client.get("/api/checkin/today").json() == {"checkin": None}


def test_sore_areas_roundtrip_and_context():
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    client.post(
        "/api/checkin",
        json={
            "date": yesterday,
            "sleep_h": 7,
            "soreness": 4,
            "sore_areas": ["hamstrings", "lower back"],
        },
    )
    saved = db.get_checkin(yesterday)
    assert saved["sore_areas"] == ["hamstrings", "lower back"]

    ctx = readiness.build_readiness_context(db.list_checkins())
    assert "MORNING READINESS" in ctx
    assert "hamstrings" in ctx


def test_context_when_empty():
    assert "No check-ins logged yet" in readiness.build_readiness_context([])
