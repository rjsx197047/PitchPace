"""All HTTP endpoints. Mounted under /api by main.py."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app import ai, db
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


# ── AI coach ────────────────────────────────────────────────────────────────


def _athlete_context() -> str:
    profile = db.get_profile()
    workouts = db.list_workouts()
    stats = compute_stats(workouts, weekly_target=profile.get("weekly_target", 5))
    return ai.build_athlete_context(profile, stats, workouts)


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
    # live athlete context injected into the system prompt each turn.
    history = db.list_chat()
    messages = [{"role": m["role"], "content": m["content"]} for m in history]
    system = COACH_SYSTEM_WITH_CONTEXT()

    result = await ai.generate(messages, system, payload.api_key)
    saved = db.add_chat_message("assistant", result["text"])
    return {
        "reply": result["text"],
        "backend": result["backend"],
        "message": saved,
    }


def COACH_SYSTEM_WITH_CONTEXT() -> str:  # noqa: N802 (reads nicely at call site)
    return ai.COACH_SYSTEM + "\n\n" + _athlete_context()


@router.post("/coach/plan")
async def coach_plan(payload: CoachRequest):
    system = COACH_SYSTEM_WITH_CONTEXT()
    messages = [{"role": "user", "content": ai.plan_prompt(payload.focus)}]
    result = await ai.generate(messages, system, payload.api_key, max_tokens=2200)
    return result


@router.post("/coach/nutrition")
async def coach_nutrition(payload: CoachRequest):
    system = COACH_SYSTEM_WITH_CONTEXT()
    messages = [{"role": "user", "content": ai.nutrition_prompt(payload.focus)}]
    result = await ai.generate(messages, system, payload.api_key, max_tokens=2000)
    return result


@router.post("/coach/recovery")
async def coach_recovery(payload: CoachRequest):
    system = COACH_SYSTEM_WITH_CONTEXT()
    messages = [{"role": "user", "content": ai.recovery_prompt(payload.focus)}]
    result = await ai.generate(messages, system, payload.api_key, max_tokens=1800)
    return result
