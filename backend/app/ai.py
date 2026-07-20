"""AI coaching service.

Two interchangeable backends, mirroring the pattern used by the Reading app:
  * Claude (Anthropic Messages API) when the caller supplies an API key
  * Local Ollama as a zero-cost fallback so the coach always works offline

Keys are never persisted — they travel per-request, in memory only. Uses raw
httpx so we don't pull in a heavy SDK.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import date
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

CLAUDE_MODEL = "claude-sonnet-4-5"
CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_API_VERSION = "2023-06-01"
CLAUDE_TIMEOUT = 60.0
OLLAMA_TIMEOUT = 120.0
MAX_TOKENS = 1800


COACH_SYSTEM = """You are PitchPace Coach, an elite strength & conditioning coach and \
sports nutritionist who specialises in soccer (football) and track & field athletes.

Your coaching philosophy:
- Periodise training: balance speed, strength, endurance, technical work and recovery.
- Respect the acute:chronic workload ratio (ACWR). Keep weekly load progression \
sensible (~10% rule) and flag injury risk when load spikes.
- Soccer players need repeated-sprint ability, agility, and aerobic base. \
Track athletes need event-specific speed/endurance and clean mechanics.
- Recovery (sleep, nutrition, mobility, deload weeks) is part of training, not optional.

How you respond:
- Be specific and actionable. Use the athlete's real logged data when it's provided.
- Prefer concrete sets/reps/distances/paces and clear weekly structure.
- Use short markdown sections, headers and bullet points. Keep it tight and scannable.
- When you lack data, make a reasonable assumption and say so briefly.
- Never give medical diagnoses; suggest seeing a professional for pain/injury."""


def is_valid_api_key_format(api_key: str | None) -> bool:
    if not api_key or not isinstance(api_key, str):
        return False
    key = api_key.strip()
    return key.startswith("sk-ant-") and len(key) > 20


def _fmt_metrics(metrics: dict[str, Any]) -> str:
    """Render whatever detail fields were logged for a session compactly. Each
    activity type logs its own metrics (sets/reps/load, intervals, match data,
    rounds, etc.), so format generically rather than against a fixed list."""
    if not metrics:
        return ""
    parts = [
        f"{key.replace('_', ' ')} {val}"
        for key, val in metrics.items()
        if val not in (None, "", 0)
    ]
    return " · ".join(parts)


def build_athlete_context(
    profile: dict[str, Any],
    stats: dict[str, Any],
    recent: list[dict[str, Any]],
) -> str:
    """A compact, model-friendly snapshot of who the athlete is and how they're
    training right now. Prepended to every coach interaction."""
    p = profile
    bio = [
        f"Name: {p.get('name', 'Athlete')}",
        f"Sport focus: {p.get('sport_focus', 'both')}",
        f"Primary event/position: {p.get('primary_event') or 'unspecified'}",
        f"Experience: {p.get('experience', 'intermediate')}",
        f"Weekly session target: {p.get('weekly_target', 5)}",
    ]
    if p.get("age"):
        bio.append(f"Age: {p['age']}")
    if p.get("weight_kg"):
        bio.append(f"Weight: {p['weight_kg']} kg")
    if p.get("height_cm"):
        bio.append(f"Height: {p['height_cm']} cm")
    if p.get("self_description"):
        bio.append(
            "Athlete's own description (baseline — weigh this heavily, "
            f"especially when little has been logged yet): {p['self_description']}"
        )
    if p.get("goals"):
        bio.append(f"Stated goals: {p['goals']}")
    if p.get("target_event") or p.get("target_event_date"):
        line = f"Target event: {p.get('target_event') or 'key event'}"
        if p.get("target_event_date"):
            line += f" on {p['target_event_date']}"
            try:
                days_out = (date.fromisoformat(p["target_event_date"]) - date.today()).days
                line += f" ({days_out} days out)"
            except ValueError:
                pass
        bio.append(line)

    tw = stats.get("this_week", {})
    load = stats.get("load", {})
    totals = stats.get("totals", {})
    training = [
        f"This week: {tw.get('sessions', 0)}/{tw.get('target', 5)} sessions, "
        f"{tw.get('minutes', 0)} min, {tw.get('distance_mi', 0)} mi, "
        f"load {tw.get('load', 0)}",
        f"ACWR (acute:chronic): {load.get('acwr', 0)} → {load.get('status', 'n/a')}",
        f"Current streak: {stats.get('streak_days', 0)} days",
        f"All-time: {totals.get('sessions', 0)} sessions, "
        f"{totals.get('distance_mi', 0)} mi, avg intensity "
        f"{totals.get('avg_intensity', 0)}/10",
    ]
    by_type = stats.get("by_type", {})
    if by_type:
        mix = ", ".join(f"{k}: {v}" for k, v in by_type.items())
        training.append(f"Session mix: {mix}")

    recent_lines = []
    for w in recent[:8]:
        metrics_str = _fmt_metrics(w.get("metrics") or {})
        recent_lines.append(
            f"- {w.get('date')} · {w.get('type')} · "
            f"{w.get('duration_min', 0)}min · {w.get('distance_mi', 0)}mi · "
            f"RPE {w.get('intensity', '-')}"
            + (f" · {w.get('title')}" if w.get("title") else "")
            + (f" · {metrics_str}" if metrics_str else "")
        )
    recent_block = "\n".join(recent_lines) if recent_lines else "No sessions logged yet."

    return (
        "=== ATHLETE PROFILE ===\n"
        + "\n".join(bio)
        + "\n\n=== CURRENT TRAINING STATE ===\n"
        + "\n".join(training)
        + "\n\n=== RECENT SESSIONS ===\n"
        + recent_block
    )


# ── Backends ────────────────────────────────────────────────────────────────


async def _query_claude(
    messages: list[dict[str, str]], system: str, api_key: str, max_tokens: int
) -> str | None:
    if not is_valid_api_key_format(api_key):
        return None
    headers = {
        "x-api-key": api_key,
        "anthropic-version": CLAUDE_API_VERSION,
        "content-type": "application/json",
    }
    body = {
        "model": CLAUDE_MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "messages": messages,
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                CLAUDE_API_URL, headers=headers, json=body, timeout=CLAUDE_TIMEOUT
            )
            if resp.status_code == 200:
                content = resp.json().get("content", [])
                if content and isinstance(content, list):
                    return content[0].get("text", "").strip()
                return None
            logger.warning("Claude API %s: %s", resp.status_code, resp.text[:200])
            return None
    except (httpx.ConnectError, httpx.TimeoutException) as e:
        logger.warning("Claude network error: %s", e)
        return None
    except Exception as e:  # noqa: BLE001
        logger.warning("Claude unexpected error: %s", e)
        return None


async def is_ollama_available() -> bool:
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{settings.ollama_base_url}/api/tags", timeout=5.0
            )
            return resp.status_code == 200
    except (httpx.ConnectError, httpx.TimeoutException):
        return False
    except Exception:  # noqa: BLE001
        return False


async def _query_ollama(
    messages: list[dict[str, str]], system: str
) -> str | None:
    payload_messages = [{"role": "system", "content": system}, *messages]
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{settings.ollama_base_url}/api/chat",
                json={
                    "model": settings.ollama_model,
                    "messages": payload_messages,
                    "stream": False,
                    "options": {"temperature": 0.7, "num_predict": 1200},
                },
                timeout=OLLAMA_TIMEOUT,
            )
            if resp.status_code == 200:
                return resp.json().get("message", {}).get("content", "").strip()
            return None
    except (httpx.ConnectError, httpx.TimeoutException):
        return None
    except Exception:  # noqa: BLE001
        return None


async def generate(
    messages: list[dict[str, str]],
    system: str,
    api_key: str | None,
    max_tokens: int = MAX_TOKENS,
) -> dict[str, Any]:
    """Try Claude (per-request key, then server key), fall back to Ollama.

    Returns {"text": str, "backend": "claude"|"ollama"|"none"}.
    """
    key = api_key or settings.claude_api_key
    if is_valid_api_key_format(key):
        text = await _query_claude(messages, system, key, max_tokens)
        if text:
            return {"text": text, "backend": "claude"}

    text = await _query_ollama(messages, system)
    if text:
        return {"text": text, "backend": "ollama"}

    return {
        "text": (
            "The AI coach is offline. Add your Claude API key in Settings, or "
            "start a local Ollama server (`ollama run llama3.2`) to enable "
            "personalised coaching."
        ),
        "backend": "none",
    }


# ── Specialised prompt builders ───────────────────────────────────────────


def plan_prompt(focus: str | None) -> str:
    extra = f"\n\nThe athlete specifically wants to emphasise: {focus}" if focus else ""
    return (
        "Design a structured 7-day training plan for this athlete based on their "
        "profile, current weekly load and recent sessions above. "
        "Respect their ACWR status (don't spike load if it's already high; build "
        "if they're undertraining). "
        "If the athlete context lists a target event, periodise this week within "
        "that timeline: build volume when the event is far out, sharpen and add "
        "specificity as it approaches, and taper (cut volume, keep intensity) in "
        "the final 7-14 days. "
        "If morning readiness data is present, scale the next days' intensity to "
        "it and avoid loading body areas with repeated soreness. "
        "For each day give: focus, the key session (with sets/reps/distances/paces "
        "or drills), intensity (RPE target), and a one-line rationale. "
        "Include at least one recovery/mobility day and note where the hardest "
        "sessions sit relative to matches or key workouts. "
        "End with 2-3 bullet coaching cues for the week." + extra
    )


def nutrition_prompt(focus: str | None) -> str:
    extra = f"\n\nAdditional context from the athlete: {focus}" if focus else ""
    return (
        "Create practical nutrition guidance for this athlete given their sport "
        "focus, body stats and current training load above. Cover: "
        "(1) daily calorie & macro targets (estimate from their stats, state "
        "assumptions), (2) what to eat pre-session, (3) intra/post-session fuelling "
        "and recovery nutrition, (4) hydration, (5) match-day or race-day fuelling, "
        "and (6) 3-4 simple meal/snack examples. Keep it realistic and specific." + extra
    )


def recovery_prompt(focus: str | None) -> str:
    extra = f"\n\nAdditional context from the athlete: {focus}" if focus else ""
    return (
        "Assess this athlete's recovery needs from their current load and ACWR "
        "status above, then give a concrete recovery protocol: sleep targets, "
        "mobility/stretching routine, active recovery options, deload guidance if "
        "load is high, and signs of overtraining to watch for. "
        "If their ACWR is in the caution/high-risk range, prioritise that advice." + extra
    )


# ── Free-text → workout draft (voice / quick-add logging) ──────────────────

def evaluate_session_prompt(text: str) -> str:
    """Coach-style evaluation of a full session the athlete pasted freeform
    (e.g. a whole lifting day). The athlete profile, recent sessions and
    readiness are supplied as context above this prompt."""
    return (
        "The athlete pasted their full training session below in free form. "
        "Evaluate it as their strength & conditioning coach, using the athlete "
        "profile, recent sessions and readiness in the context above.\n\n"
        "Respond in tight markdown with these sections:\n"
        "- **Session summary** — movement patterns / muscle groups trained, "
        "total working sets, and rough training volume.\n"
        "- **What worked** — sound exercise selection, progression, or the form "
        "cues they noted.\n"
        "- **Gaps & balance** — push/pull and muscle-group balance, rep ranges "
        "vs their goals, anything over- or under-worked (weigh the week, not "
        "just today).\n"
        "- **Load & progression** — read the actual weights and reps, then give "
        "specific next-step numbers to progress.\n"
        "- **Watch-outs** — flag anything that fits their injury history or an "
        "ACWR / readiness concern.\n"
        "- **Next session** — 2-4 concrete, actionable cues.\n\n"
        "Reference their real numbers. Note any assumption briefly when the "
        "paste is ambiguous.\n\n"
        "=== ATHLETE'S PASTED SESSION ===\n"
        f"{text}"
    )


PARSE_SYSTEM = (
    "You convert a spoken or typed workout description into structured JSON. "
    "Reply with ONLY one JSON object — no prose, no markdown fences."
)


def parse_text_prompt(text: str, workout_types: list[str]) -> str:
    today = date.today().isoformat()
    return (
        "Convert this workout description to JSON with exactly these keys:\n"
        f'  date: "YYYY-MM-DD" (today is {today}; resolve words like '
        '"yesterday"; default to today)\n'
        f"  type: one of {json.dumps(workout_types)}\n"
        "  title: short summary string (e.g. \"6x400m @ 70s\")\n"
        "  duration_min: number (estimate if unstated)\n"
        "  distance_mi: number (0 if not applicable)\n"
        "  intensity: RPE 1-10 (estimate from how hard it sounds)\n"
        "  calories: number or null\n"
        "  metrics: object with only relevant keys such as reps, rep_distance_m, "
        "rest_s, sets, load_kg, avg_pace, rounds, round_min, avg_hr, "
        "goals, assists, position\n"
        "  notes: anything else worth keeping, else \"\"\n\n"
        f"Description: {text}"
    )


def extract_workout_json(raw: str, workout_types: list[str]) -> dict[str, Any] | None:
    """Pull the JSON object out of a model reply and coerce it into a safe
    workout draft. Returns None when there's nothing parseable."""
    cleaned = re.sub(r"```(?:json)?", "", raw).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        data = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None

    def _num(v: Any, default: float = 0) -> float:
        try:
            return float(v)
        except (TypeError, ValueError):
            return default

    # Fuzzy type match so "run" or "distance run" both land correctly.
    raw_type = str(data.get("type") or "").lower()
    type_ = next(
        (t for t in workout_types if t.lower() == raw_type),
        next((t for t in workout_types if raw_type and raw_type in t.lower()), None),
    ) or "Cross-Training"

    day = str(data.get("date") or "")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
        day = date.today().isoformat()

    metrics = data.get("metrics") if isinstance(data.get("metrics"), dict) else {}
    metrics = {
        str(k): v for k, v in metrics.items()
        if isinstance(v, (str, int, float)) and v not in ("", None)
    }

    calories = data.get("calories")
    return {
        "date": day,
        "type": type_,
        "title": str(data.get("title") or "")[:120],
        "duration_min": round(_num(data.get("duration_min")), 1),
        "distance_mi": round(_num(data.get("distance_mi")), 2),
        "intensity": int(min(10, max(1, _num(data.get("intensity"), 6)))),
        "calories": int(_num(calories)) if calories not in (None, "", 0) else None,
        "metrics": metrics,
        "notes": str(data.get("notes") or "")[:500],
    }
