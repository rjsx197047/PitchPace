"""All HTTP endpoints. Mounted under /api by main.py."""

from __future__ import annotations

import csv
import io
import json

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

from app import ai, db, importers, rag
from app.models import (
    WORKOUT_TYPES,
    ChatRequest,
    CoachRequest,
    ProfileUpdate,
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


def _athlete_context(question: str | None = None) -> str:
    """Profile + current state, plus a RAG digest of the athlete's entire
    history (and question-relevant retrieved sessions when one is given)."""
    profile = db.get_profile()
    workouts = db.list_workouts()
    stats = compute_stats(workouts, weekly_target=profile.get("weekly_target", 5))
    base = ai.build_athlete_context(profile, stats, workouts)
    history = rag.build_history_context(question, workouts, search=db.search_workouts)
    return base + "\n\n" + history


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
