"""All HTTP endpoints. Mounted under /api by main.py."""

from __future__ import annotations

import csv
import io
import json
from datetime import date

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from app import ai, db, importers, rag, readiness, sync
from app.models import (
    WORKOUT_TYPES,
    ChatRequest,
    CheckinUpsert,
    CoachRequest,
    FilmSessionCreate,
    FilmSessionUpdate,
    ParseTextRequest,
    ProfileUpdate,
    SyncExportRequest,
    WorkoutCreate,
    WorkoutUpdate,
)
from app.stats import compute_stats

router = APIRouter()

MAX_IMPORT_BYTES = 100 * 1024 * 1024  # Apple Health exports can be huge


# ── Health & meta ───────────────────────────────────────────────────────────


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "app": "PitchPace",
        "ollama_available": await ai.is_ollama_available(),
        "workout_types": WORKOUT_TYPES,
    }


@router.get("/workout-types")
async def workout_types():
    return {"types": WORKOUT_TYPES}


# ── Profile ─────────────────────────────────────────────────────────────────


@router.get("/profile")
async def get_profile():
    return db.get_profile()


@router.put("/profile")
async def put_profile(payload: ProfileUpdate):
    return db.update_profile(payload.model_dump(exclude_none=True))


# ── Workouts ────────────────────────────────────────────────────────────────


@router.get("/workouts")
async def get_workouts(limit: int | None = None):
    return {"workouts": db.list_workouts(limit=limit)}


@router.post("/workouts")
async def post_workout(payload: WorkoutCreate):
    return db.create_workout(payload.model_dump())


@router.put("/workouts/{workout_id}")
async def put_workout(workout_id: int, payload: WorkoutUpdate):
    updated = db.update_workout(workout_id, payload.model_dump(exclude_none=True))
    if updated is None:
        raise HTTPException(status_code=404, detail="Workout not found")
    return updated


@router.delete("/workouts/{workout_id}")
async def remove_workout(workout_id: int):
    if not db.delete_workout(workout_id):
        raise HTTPException(status_code=404, detail="Workout not found")
    return {"deleted": workout_id}


# ── Stats ───────────────────────────────────────────────────────────────────


@router.get("/stats")
async def get_stats():
    profile = db.get_profile()
    workouts = db.list_workouts()
    return compute_stats(workouts, weekly_target=profile.get("weekly_target", 5))


# ── Readiness check-ins ─────────────────────────────────────────────────────


@router.get("/checkins")
async def get_checkins(limit: int = 30):
    return {"checkins": readiness.with_readiness(db.list_checkins(limit=limit))}


@router.get("/checkin/today")
async def get_checkin_today():
    today = date.today().isoformat()
    checkin = db.get_checkin(today)
    if checkin is None:
        return {"checkin": None}
    all_recent = db.list_checkins(limit=30)
    hrv_base, rhr_base = readiness.baselines(all_recent, exclude_date=today)
    return {
        "checkin": {
            **checkin,
            "readiness": readiness.readiness(checkin, hrv_base, rhr_base),
        }
    }


@router.post("/checkin")
async def post_checkin(payload: CheckinUpsert):
    data = payload.model_dump()
    data["date"] = data.get("date") or date.today().isoformat()
    saved = db.upsert_checkin(data)
    all_recent = db.list_checkins(limit=30)
    hrv_base, rhr_base = readiness.baselines(all_recent, exclude_date=saved["date"])
    return {**saved, "readiness": readiness.readiness(saved, hrv_base, rhr_base)}


# ── Quick-add: free text / voice → workout draft ────────────────────────────


@router.post("/workouts/parse-text")
async def parse_workout_text(payload: ParseTextRequest):
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Description is empty")
    messages = [{"role": "user", "content": ai.parse_text_prompt(text, WORKOUT_TYPES)}]
    result = await ai.generate(messages, ai.PARSE_SYSTEM, payload.api_key, max_tokens=600)
    if result["backend"] == "none":
        raise HTTPException(
            status_code=503,
            detail="Quick-add needs AI: add a Claude key in Settings or start "
            "local Ollama.",
        )
    draft = ai.extract_workout_json(result["text"], WORKOUT_TYPES)
    if draft is None:
        raise HTTPException(
            status_code=422,
            detail="Couldn't understand that — try including the activity and "
            "duration, e.g. \"45 min tempo run, 5 miles, felt hard\".",
        )
    return {"workout": draft, "backend": result["backend"]}


# ── Film Room (local match-video tagging) ───────────────────────────────────


@router.get("/film")
async def get_film_sessions(limit: int = 50):
    return {"sessions": db.list_film_sessions(limit=limit)}


@router.post("/film")
async def post_film_session(payload: FilmSessionCreate):
    data = payload.model_dump()
    data["date"] = data.get("date") or date.today().isoformat()
    return db.create_film_session(data)


@router.put("/film/{film_id}")
async def put_film_session(film_id: int, payload: FilmSessionUpdate):
    updated = db.update_film_session(
        film_id, payload.model_dump(exclude_none=True)
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Film session not found")
    return updated


@router.delete("/film/{film_id}")
async def remove_film_session(film_id: int):
    if not db.delete_film_session(film_id):
        raise HTTPException(status_code=404, detail="Film session not found")
    return {"deleted": film_id}


# ── Encrypted device sync ───────────────────────────────────────────────────


@router.post("/sync/export")
async def sync_export(payload: SyncExportRequest):
    if len(payload.passphrase) < sync.MIN_PASSPHRASE_LEN:
        raise HTTPException(
            status_code=400,
            detail=f"Passphrase must be at least {sync.MIN_PASSPHRASE_LEN} characters",
        )
    blob = sync.encrypt_payload(sync.export_payload(), payload.passphrase)
    filename = f"pitchpace-{date.today().isoformat()}.ppsync"
    return Response(
        content=blob,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/sync/import")
async def sync_import(file: UploadFile = File(...), passphrase: str = Form(...)):
    blob = await file.read()
    try:
        payload = sync.decrypt_payload(blob, passphrase)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return sync.merge_payload(payload)


# ── Import (wearables / fitness apps) ───────────────────────────────────────


@router.post("/import/parse")
async def import_parse(file: UploadFile = File(...)):
    """Parse a TCX / GPX / FIT / Apple Health file into workout drafts.

    Nothing is saved — the UI shows the drafts for review and posts the ones
    the user confirms through the normal /workouts endpoint.
    """
    data = await file.read()
    if len(data) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 100 MB)")
    try:
        return importers.parse_upload(file.filename or "", data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Export (data portability) ───────────────────────────────────────────────


@router.get("/export.json")
async def export_json():
    payload = {"profile": db.get_profile(), "workouts": db.list_workouts()}
    return Response(
        content=json.dumps(payload, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="pitchpace-export.json"'},
    )


@router.get("/export.csv")
async def export_csv():
    workouts = db.list_workouts()
    buf = io.StringIO()
    fields = [
        "id", "date", "type", "title", "duration_min", "distance_mi",
        "intensity", "calories", "notes", "metrics",
    ]
    writer = csv.DictWriter(buf, fieldnames=fields)
    writer.writeheader()
    for w in workouts:
        row = {k: w.get(k) for k in fields}
        row["metrics"] = json.dumps(w.get("metrics") or {})
        writer.writerow(row)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="pitchpace-export.csv"'},
    )


# ── AI coach ────────────────────────────────────────────────────────────────


def _film_context() -> str:
    """Compact summary of recent match-film tags for the coach."""
    sessions = db.list_film_sessions(limit=3)
    if not sessions:
        return ""
    lines = []
    for s in sessions:
        tags = s.get("tags") or []
        counts: dict[str, int] = {}
        for t in tags:
            counts[t.get("label", "?")] = counts.get(t.get("label", "?"), 0) + 1
        summary = ", ".join(f"{k} x{v}" for k, v in sorted(counts.items(), key=lambda kv: -kv[1]))
        lines.append(
            f"- {s.get('date')} · {s.get('title') or s.get('video_name') or 'film session'}"
            f" · {len(tags)} tags" + (f": {summary}" if summary else "")
        )
    return "=== MATCH FILM TAGS (latest first) ===\n" + "\n".join(lines)


def _athlete_context(question: str | None = None) -> str:
    """Profile + current state, plus the morning-readiness trail, recent film
    tags, and a RAG digest of the athlete's entire history (question-aware
    when one is given)."""
    profile = db.get_profile()
    workouts = db.list_workouts()
    stats = compute_stats(workouts, weekly_target=profile.get("weekly_target", 5))
    parts = [
        ai.build_athlete_context(profile, stats, workouts),
        readiness.build_readiness_context(db.list_checkins(limit=30)),
        _film_context(),
        rag.build_history_context(question, workouts, search=db.search_workouts),
    ]
    return "\n\n".join(p for p in parts if p)


@router.get("/chat")
async def get_chat():
    return {"messages": db.list_chat()}


@router.delete("/chat")
async def delete_chat():
    db.clear_chat()
    return {"cleared": True}


@router.post("/chat")
async def post_chat(payload: ChatRequest):
    user_text = payload.message.strip()
    if not user_text:
        raise HTTPException(status_code=400, detail="Message is empty")

    db.add_chat_message("user", user_text)

    # Rebuild the conversation for the model from persisted history, with the
    # live athlete context injected into the system prompt each turn. The RAG
    # retrieval is keyed off the new question so relevant past sessions surface.
    history = db.list_chat()
    messages = [{"role": m["role"], "content": m["content"]} for m in history]
    system = COACH_SYSTEM_WITH_CONTEXT(user_text)

    result = await ai.generate(messages, system, payload.api_key)
    saved = db.add_chat_message("assistant", result["text"])
    return {
        "reply": result["text"],
        "backend": result["backend"],
        "message": saved,
    }


def COACH_SYSTEM_WITH_CONTEXT(question: str | None = None) -> str:  # noqa: N802 (reads nicely at call site)
    return ai.COACH_SYSTEM + "\n\n" + _athlete_context(question)


@router.post("/coach/plan")
async def coach_plan(payload: CoachRequest):
    system = COACH_SYSTEM_WITH_CONTEXT(payload.focus)
    messages = [{"role": "user", "content": ai.plan_prompt(payload.focus)}]
    result = await ai.generate(messages, system, payload.api_key, max_tokens=2200)
    return result


@router.post("/coach/nutrition")
async def coach_nutrition(payload: CoachRequest):
    system = COACH_SYSTEM_WITH_CONTEXT(payload.focus)
    messages = [{"role": "user", "content": ai.nutrition_prompt(payload.focus)}]
    result = await ai.generate(messages, system, payload.api_key, max_tokens=2000)
    return result


@router.post("/coach/recovery")
async def coach_recovery(payload: CoachRequest):
    system = COACH_SYSTEM_WITH_CONTEXT(payload.focus)
    messages = [{"role": "user", "content": ai.recovery_prompt(payload.focus)}]
    result = await ai.generate(messages, system, payload.api_key, max_tokens=1800)
    return result
