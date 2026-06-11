"""Retrieval over the athlete's full training history (RAG).

The base athlete context (profile + this week + last 8 sessions) is great for
"how am I doing", but questions like "compare this month to my pre-season block"
need the whole log. This module distils the entire workouts table into a compact
digest and retrieves the sessions most relevant to the current question:

  * lifetime per-type aggregates and monthly volume
  * weekly load series (16 weeks)
  * personal bests
  * keyword matches via SQLite FTS5
  * an explicit date window when the question names one ("last 6 weeks", "May")

Pure functions over workout dicts — the FTS search is injected as a callable so
everything here is trivially testable without a database.
"""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Callable

MAX_CONTEXT_CHARS = 4500

# Words that carry no retrieval signal for FTS.
_STOPWORDS = {
    "the", "and", "for", "was", "were", "what", "when", "how", "did", "you",
    "your", "can", "could", "should", "would", "about", "with", "this", "that",
    "are", "have", "has", "had", "been", "from", "last", "next", "week",
    "weeks", "month", "months", "day", "days", "year", "years", "session",
    "sessions", "workout", "workouts", "training", "train", "give", "make",
    "tell", "show", "compare", "compared", "versus", "since", "ago", "much",
    "many", "best", "today", "yesterday", "plan", "coach", "doing", "feel",
}

_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11,
    "december": 12,
}


def _parse_date(d: str) -> date | None:
    try:
        return datetime.fromisoformat(d).date()
    except (ValueError, TypeError):
        return None


def _terms(question: str) -> list[str]:
    words = re.findall(r"[A-Za-z0-9]+", question.lower())
    return [w for w in words if len(w) >= 3 and w not in _STOPWORDS]


def _fmt_session(w: dict[str, Any]) -> str:
    bits = [w.get("date", "?"), w.get("type", "?")]
    if w.get("title"):
        bits.append(str(w["title"]))
    if w.get("duration_min"):
        bits.append(f"{round(float(w['duration_min']))}min")
    if w.get("distance_mi"):
        bits.append(f"{round(float(w['distance_mi']), 1)}mi")
    bits.append(f"RPE {w.get('intensity', '-')}")
    metrics = w.get("metrics") or {}
    extra = " ".join(
        f"{k.replace('_', ' ')}={v}" for k, v in list(metrics.items())[:4]
        if v not in (None, "", 0)
    )
    if extra:
        bits.append(extra)
    if w.get("notes"):
        notes = str(w["notes"])
        bits.append(notes[:80] + ("…" if len(notes) > 80 else ""))
    return "- " + " · ".join(bits)


# ── Aggregates ──────────────────────────────────────────────────────────────


def _load(w: dict[str, Any]) -> float:
    return float(w.get("duration_min") or 0) * float(w.get("intensity") or 0)


def lifetime_by_type(workouts: list[dict[str, Any]]) -> list[str]:
    agg: dict[str, dict[str, float]] = defaultdict(
        lambda: {"n": 0, "min": 0.0, "mi": 0.0, "rpe": 0.0}
    )
    last_seen: dict[str, str] = {}
    for w in workouts:
        t = w.get("type", "Other")
        agg[t]["n"] += 1
        agg[t]["min"] += float(w.get("duration_min") or 0)
        agg[t]["mi"] += float(w.get("distance_mi") or 0)
        agg[t]["rpe"] += float(w.get("intensity") or 0)
        if w.get("date") and (t not in last_seen or w["date"] > last_seen[t]):
            last_seen[t] = w["date"]
    lines = []
    for t, a in sorted(agg.items(), key=lambda kv: -kv[1]["n"]):
        line = (
            f"- {t}: {int(a['n'])} sessions · {round(a['min'])} min"
            + (f" · {round(a['mi'], 1)} mi" if a["mi"] else "")
            + f" · avg RPE {round(a['rpe'] / a['n'], 1)}"
            + (f" · last {last_seen.get(t, '?')}" if last_seen.get(t) else "")
        )
        lines.append(line)
    return lines


def monthly_volume(workouts: list[dict[str, Any]], months: int = 12) -> list[str]:
    agg: dict[str, dict[str, float]] = defaultdict(
        lambda: {"n": 0, "min": 0.0, "mi": 0.0}
    )
    for w in workouts:
        d = _parse_date(w.get("date", ""))
        if d is None:
            continue
        key = f"{d.year}-{d.month:02d}"
        agg[key]["n"] += 1
        agg[key]["min"] += float(w.get("duration_min") or 0)
        agg[key]["mi"] += float(w.get("distance_mi") or 0)
    recent = sorted(agg.items())[-months:]
    return [
        f"- {k}: {int(a['n'])} sessions · {round(a['min'])} min"
        + (f" · {round(a['mi'], 1)} mi" if a["mi"] else "")
        for k, a in recent
    ]


def weekly_loads(workouts: list[dict[str, Any]], weeks: int = 16) -> list[str]:
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    lines = []
    for i in range(weeks - 1, -1, -1):
        ws = week_start - timedelta(weeks=i)
        we = ws + timedelta(days=7)
        wk = [
            w for w in workouts
            if (d := _parse_date(w.get("date", ""))) and ws <= d < we
        ]
        if not wk:
            continue
        lines.append(
            f"- wk of {ws.isoformat()}: {len(wk)} sessions · "
            f"{round(sum(float(w.get('duration_min') or 0) for w in wk))} min · "
            f"load {round(sum(_load(w) for w in wk))}"
        )
    return lines


def personal_bests(workouts: list[dict[str, Any]]) -> list[str]:
    lines: list[str] = []
    dated = [w for w in workouts if w.get("date")]

    runs = [w for w in dated if float(w.get("distance_mi") or 0) > 0]
    if runs:
        far = max(runs, key=lambda w: float(w["distance_mi"]))
        lines.append(
            f"- Longest distance: {round(float(far['distance_mi']), 1)} mi "
            f"({far['type']}, {far['date']})"
        )
        paced = [
            w for w in runs
            if float(w.get("duration_min") or 0) > 0 and float(w["distance_mi"]) >= 1
        ]
        if paced:
            fast = min(
                paced, key=lambda w: float(w["duration_min"]) / float(w["distance_mi"])
            )
            pace = float(fast["duration_min"]) / float(fast["distance_mi"])
            lines.append(
                f"- Fastest avg pace: {int(pace)}:{round((pace % 1) * 60):02d} min/mi "
                f"({fast['type']}, {fast['date']})"
            )
    if dated:
        long = max(dated, key=lambda w: float(w.get("duration_min") or 0))
        if float(long.get("duration_min") or 0) > 0:
            lines.append(
                f"- Longest session: {round(float(long['duration_min']))} min "
                f"({long['type']}, {long['date']})"
            )
        heavy = max(dated, key=_load)
        if _load(heavy) > 0:
            lines.append(
                f"- Highest-load session: {round(_load(heavy))} "
                f"({heavy['type']}, {heavy['date']})"
            )
    return lines


# ── Question-aware retrieval ────────────────────────────────────────────────


def question_window(question: str, today: date | None = None) -> tuple[str, date, date] | None:
    """Detect an explicit timeframe in the question → (label, start, end)."""
    q = question.lower()
    today = today or date.today()

    m = re.search(r"(?:last|past)\s+(\d{1,2})\s+(day|week|month)s?", q)
    if m:
        n, unit = int(m.group(1)), m.group(2)
        days = n * {"day": 1, "week": 7, "month": 30}[unit]
        return (f"last {n} {unit}s", today - timedelta(days=days), today)
    if "last month" in q or "past month" in q:
        first_this = today.replace(day=1)
        last_end = first_this - timedelta(days=1)
        return ("last month", last_end.replace(day=1), first_this)
    if "this month" in q:
        return ("this month", today.replace(day=1), today)
    if "this year" in q:
        return ("this year", today.replace(month=1, day=1), today)
    for name, num in _MONTHS.items():
        if re.search(rf"\b{name}\b", q):
            year = today.year if num <= today.month else today.year - 1
            ym = re.search(rf"{name}\s+(20\d\d)", q)
            if ym:
                year = int(ym.group(1))
            start = date(year, num, 1)
            end = date(year + 1, 1, 1) if num == 12 else date(year, num + 1, 1)
            return (f"{name.capitalize()} {year}", start, end)
    return None


def build_history_context(
    question: str | None,
    workouts: list[dict[str, Any]],
    search: Callable[[list[str]], list[dict[str, Any]]] | None = None,
) -> str:
    """The full-history digest + question-relevant retrieval block."""
    if not workouts:
        return "=== FULL TRAINING HISTORY ===\nNo sessions logged yet."

    sections: list[str] = ["=== FULL TRAINING HISTORY (retrieved) ==="]

    by_type = lifetime_by_type(workouts)
    if by_type:
        sections.append("Lifetime by activity:\n" + "\n".join(by_type))

    months = monthly_volume(workouts)
    if len(months) > 1:
        sections.append("Monthly volume:\n" + "\n".join(months))

    loads = weekly_loads(workouts)
    if loads:
        sections.append("Weekly load (16w):\n" + "\n".join(loads))

    bests = personal_bests(workouts)
    if bests:
        sections.append("Personal bests:\n" + "\n".join(bests))

    if question:
        window = question_window(question)
        if window:
            label, start, end = window
            in_window = [
                w for w in workouts
                if (d := _parse_date(w.get("date", ""))) and start <= d <= end
            ][:20]
            if in_window:
                sections.append(
                    f"Sessions in {label} ({start} → {end}):\n"
                    + "\n".join(_fmt_session(w) for w in in_window)
                )

        if search:
            matches = search(_terms(question))
            if matches:
                sections.append(
                    "Sessions matching the question:\n"
                    + "\n".join(_fmt_session(w) for w in matches)
                )

    out = "\n\n".join(sections)
    return out[:MAX_CONTEXT_CHARS]
