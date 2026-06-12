"""Encrypted sync: crypto roundtrip, tamper/passphrase failures, merge dedup."""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app import db, sync
from app.main import app

client = TestClient(app)

PASS = "correct horse battery"


def _seed_workout(**overrides):
    w = {
        "date": date.today().isoformat(),
        "type": "Distance Run",
        "title": "Easy 5",
        "duration_min": 40,
        "distance_mi": 5.0,
        "intensity": 6,
        "metrics": {},
        "notes": "",
    }
    w.update(overrides)
    return db.create_workout(w)


def test_encrypt_decrypt_roundtrip():
    payload = {"hello": "world", "n": 42}
    blob = sync.encrypt_payload(payload, PASS)
    assert blob.startswith(sync.MAGIC)
    assert sync.decrypt_payload(blob, PASS) == payload


def test_wrong_passphrase_and_garbage_rejected():
    blob = sync.encrypt_payload({"a": 1}, PASS)
    with pytest.raises(ValueError, match="passphrase"):
        sync.decrypt_payload(blob, "not the passphrase")
    with pytest.raises(ValueError, match="sync file"):
        sync.decrypt_payload(b"definitely not a sync blob", PASS)
    # Flipping a ciphertext byte must break the GCM auth tag.
    tampered = blob[:-1] + bytes([blob[-1] ^ 0xFF])
    with pytest.raises(ValueError):
        sync.decrypt_payload(tampered, PASS)


def test_merge_dedups_and_adds():
    _seed_workout()
    client.post("/api/checkin", json={"sleep_h": 7})
    payload = sync.export_payload()

    # Importing our own export adds nothing new.
    counts = sync.merge_payload(payload)
    assert counts["workouts_added"] == 0
    assert counts["checkins_added"] == 0
    assert counts["skipped"] >= 2
    assert len(db.list_workouts()) == 1

    # A workout we don't have yet gets added.
    payload["workouts"].append(
        {**payload["workouts"][0], "title": "Tempo 6", "duration_min": 50}
    )
    counts = sync.merge_payload(payload)
    assert counts["workouts_added"] == 1
    assert len(db.list_workouts()) == 2


def test_sync_endpoints_roundtrip():
    _seed_workout(title="Endpoint run")

    resp = client.post("/api/sync/export", json={"passphrase": PASS})
    assert resp.status_code == 200
    assert resp.headers["content-disposition"].endswith('.ppsync"')
    blob = resp.content

    short = client.post("/api/sync/export", json={"passphrase": "short"})
    assert short.status_code == 400

    # Wipe local data, then import the file back.
    with db.get_conn() as conn:
        conn.execute("DELETE FROM workouts")
    result = client.post(
        "/api/sync/import",
        files={"file": ("backup.ppsync", blob, "application/octet-stream")},
        data={"passphrase": PASS},
    ).json()
    assert result["workouts_added"] == 1
    assert db.list_workouts()[0]["title"] == "Endpoint run"

    wrong = client.post(
        "/api/sync/import",
        files={"file": ("backup.ppsync", blob, "application/octet-stream")},
        data={"passphrase": "wrong wrong wrong"},
    )
    assert wrong.status_code == 400


def test_profile_adopted_only_when_local_is_pristine():
    payload = sync.export_payload()
    payload["profile"] = {**payload["profile"], "name": "Remote Athlete"}
    sync.merge_payload(payload)
    assert db.get_profile()["name"] == "Remote Athlete"  # local was empty

    payload["profile"] = {**payload["profile"], "name": "Someone Else"}
    sync.merge_payload(payload)
    assert db.get_profile()["name"] == "Remote Athlete"  # never clobbered


def test_film_sessions_travel_in_sync():
    client.post(
        "/api/film",
        json={"title": "vs City", "video_name": "city.mp4",
              "tags": [{"t": 10, "label": "Goal"}]},
    )
    payload = sync.export_payload()
    with db.get_conn() as conn:
        conn.execute("DELETE FROM film_sessions")
    counts = sync.merge_payload(payload)
    assert counts["film_added"] == 1
    restored = db.list_film_sessions()[0]
    assert restored["title"] == "vs City"
    assert restored["tags"][0]["label"] == "Goal"
