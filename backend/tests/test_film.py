"""Film Room: tagging-session CRUD and AI-context summary."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from app.main import app
from app.routes import _film_context

client = TestClient(app)

TAGS = [
    {"t": 12.5, "label": "Sprint", "note": ""},
    {"t": 340.0, "label": "Goal", "note": "far post finish"},
    {"t": 355.2, "label": "Sprint", "note": "recovery run"},
]


def test_film_crud_roundtrip():
    created = client.post(
        "/api/film",
        json={"title": "vs United", "video_name": "match.mp4", "tags": TAGS},
    ).json()
    assert created["id"] > 0
    assert created["date"] == date.today().isoformat()
    assert len(created["tags"]) == 3
    assert created["tags"][1]["note"] == "far post finish"

    listed = client.get("/api/film").json()["sessions"]
    assert [s["id"] for s in listed] == [created["id"]]

    updated = client.put(
        f"/api/film/{created['id']}",
        json={"tags": TAGS + [{"t": 400, "label": "Tackle"}], "notes": "good half"},
    ).json()
    assert len(updated["tags"]) == 4
    assert updated["notes"] == "good half"
    assert updated["title"] == "vs United"  # untouched fields survive

    assert client.delete(f"/api/film/{created['id']}").status_code == 200
    assert client.get("/api/film").json()["sessions"] == []
    assert client.delete("/api/film/9999").status_code == 404


def test_film_context_summarises_tags():
    client.post(
        "/api/film",
        json={"title": "vs United", "video_name": "match.mp4", "tags": TAGS},
    )
    ctx = _film_context()
    assert "MATCH FILM TAGS" in ctx
    assert "vs United" in ctx
    assert "Sprint x2" in ctx
    assert "Goal x1" in ctx


def test_film_context_empty_is_silent():
    assert _film_context() == ""
