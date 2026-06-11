"""Pydantic request/response schemas."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

# Workout categories tuned for soccer + track athletes.
WORKOUT_TYPES = [
    "Match",
    "Team Training",
    "Sprint / Track Session",
    "Distance Run",
    "Tempo Run",
    "Strength & Power",
    "Weightlifting",
    "Calisthenics",
    "Technical / Ball Work",
    "Plyometrics",
    "Recovery / Mobility",
    "Cross-Training",
    "Boxing",
    "Testing / Benchmarks",
]


# ── Profile ─────────────────────────────────────────────────────────────────


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    sport_focus: Optional[Literal["soccer", "track", "both"]] = None
    primary_event: Optional[str] = None
    age: Optional[int] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    experience: Optional[Literal["beginner", "intermediate", "advanced"]] = None
    weekly_target: Optional[int] = None
    goals: Optional[str] = None
    # Periodisation target: the plan builder tapers toward this.
    target_event: Optional[str] = None
    target_event_date: Optional[str] = None  # YYYY-MM-DD, "" clears it


# ── Workouts ────────────────────────────────────────────────────────────────


class WorkoutCreate(BaseModel):
    date: str  # YYYY-MM-DD
    type: str
    title: str = ""
    duration_min: float = 0
    distance_mi: float = 0
    intensity: int = Field(default=5, ge=1, le=10)
    calories: Optional[int] = None
    metrics: dict[str, Any] = Field(default_factory=dict)
    notes: str = ""


class WorkoutUpdate(BaseModel):
    date: Optional[str] = None
    type: Optional[str] = None
    title: Optional[str] = None
    duration_min: Optional[float] = None
    distance_mi: Optional[float] = None
    intensity: Optional[int] = Field(default=None, ge=1, le=10)
    calories: Optional[int] = None
    metrics: Optional[dict[str, Any]] = None
    notes: Optional[str] = None


# ── AI coach ────────────────────────────────────────────────────────────────


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str
    api_key: Optional[str] = None


class CoachRequest(BaseModel):
    """Used by plan / nutrition / recovery generators."""

    focus: Optional[str] = None  # free-text emphasis from the user
    api_key: Optional[str] = None


# ── Readiness check-ins ─────────────────────────────────────────────────────


class CheckinUpsert(BaseModel):
    """One morning check-in per day; posting again updates that day."""

    date: Optional[str] = None  # defaults to today (server local)
    sleep_h: float = Field(default=0, ge=0, le=24)
    sleep_quality: int = Field(default=3, ge=1, le=5)
    energy: int = Field(default=3, ge=1, le=5)
    soreness: int = Field(default=1, ge=1, le=5)  # 5 = very sore
    sore_areas: list[str] = Field(default_factory=list)
    resting_hr: Optional[int] = Field(default=None, ge=20, le=140)
    hrv_ms: Optional[float] = Field(default=None, ge=0, le=400)
    notes: str = ""


# ── Quick-add (voice / free text) ───────────────────────────────────────────


class ParseTextRequest(BaseModel):
    text: str
    api_key: Optional[str] = None
