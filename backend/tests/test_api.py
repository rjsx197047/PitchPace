"""Endpoint tests: workouts CRUD, stats, export, import upload."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from app.main import app
from tests.test_importers import TCX_SAMPLE

client = TestClient(app)


def make_workout(**overrides):
    payload = {
        "date": date.today().isoformat(),
        "type": "Distance Run",
        "title": "Easy 5",
        "duration_min": 40,
        "distance_mi": 5.0,
        "intensity": 6,
        "metrics": {"avg_hr": 150},
        "notes": "felt smooth",
    }
    payload.update(overrides)
    resp = client.post("/api/workouts", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_workout_crud():
    w = make_workout()
    assert w["id"] > 0
    assert w["metrics"]["avg_hr"] == 150

    listed = client.get("/api/workouts").json()["workouts"]
    assert [x["id"] for x in listed] == [w["id"]]

    updated = client.put(
        f"/api/workouts/{w['id']}", json={"duration_min": 55}
    ).json()
    assert updated["duration_min"] == 55

    assert client.delete(f"/api/workouts/{w['id']}").status_code == 200
    assert client.get("/api/workouts").json()["workouts"] == []


def test_stats_reflect_workouts():
    make_workout(duration_min=60, intensity=7)
    make_workout(type="Boxing", title="Pads", duration_min=30, distance_mi=0)

    stats = client.get("/api/stats").json()
    assert stats["totals"]["sessions"] == 2
    assert stats["this_week"]["sessions"] == 2
    assert stats["this_week"]["load"] > 0
    assert stats["by_type"]["Boxing"] == 1


def test_export_json_and_csv():
    make_workout()

    js = client.get("/api/export.json")
    assert js.status_code == 200
    assert "attachment" in js.headers["content-disposition"]
    assert len(js.json()["workouts"]) == 1

    csv_resp = client.get("/api/export.csv")
    assert csv_resp.status_code == 200
    body = csv_resp.text.splitlines()
    assert body[0].startswith("id,date,type")
    assert len(body) == 2


def test_import_parse_endpoint():
    resp = client.post(
        "/api/import/parse",
        files={"file": ("run.tcx", TCX_SAMPLE, "application/xml")},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["source"] == "tcx"
    assert len(data["workouts"]) == 1
    assert data["workouts"][0]["type"] == "Distance Run"


def test_import_rejects_unknown_format():
    resp = client.post(
        "/api/import/parse",
        files={"file": ("notes.txt", b"just some text", "text/plain")},
    )
    assert resp.status_code == 400
