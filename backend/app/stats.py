"""Dashboard aggregations computed from the raw workout log.

Includes athlete-relevant load metrics: session RPE load (duration x intensity)
and the acute:chronic workload ratio (ACWR) — a widely used readiness / injury
guardrail in soccer and track. Pure functions over a list of workout dicts so
they're trivial to test.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any


def _parse(d: str) -> date | None:
    try:
        return datetime.fromisoformat(d).date()
    except (ValueError, TypeError):
        try:
            return datetime.strptime(d, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return None


def _session_load(w: dict[str, Any]) -> float:
    """sRPE load = duration (min) x intensity (RPE 1-10)."""
    return float(w.get("duration_min") or 0) * float(w.get("intensity") or 0)


def compute_stats(workouts: list[dict[str, Any]], weekly_target: int = 5) -> dict[str, Any]:
    today = date.today()
    week_start = today - timedelta(days=today.weekday())  # Monday

    dated = [(w, _parse(w["date"])) for w in workouts]
    dated = [(w, d) for w, d in dated if d is not None]

    # ── This week ────────────────────────────────────────────────────────
    this_week = [w for w, d in dated if d >= week_start]
    week_minutes = sum(float(w.get("duration_min") or 0) for w in this_week)
    week_distance = sum(float(w.get("distance_mi") or 0) for w in this_week)
    week_load = sum(_session_load(w) for w in this_week)

    # ── Acute (7d) vs chronic (28d) load → ACWR ──────────────────────────
    acute = sum(_session_load(w) for w, d in dated if d > today - timedelta(days=7))
    chronic_total = sum(
        _session_load(w) for w, d in dated if d > today - timedelta(days=28)
    )
    chronic_weekly = chronic_total / 4 if chronic_total else 0
    acwr = round(acute / chronic_weekly, 2) if chronic_weekly else 0.0

    # ── Streak (consecutive days back from today with >=1 session) ───────
    days_with = {d for _, d in dated}
    streak = 0
    cursor = today
    # allow today to be empty without breaking the streak
    if today not in days_with and (today - timedelta(days=1)) in days_with:
        cursor = today - timedelta(days=1)
    while cursor in days_with:
        streak += 1
        cursor -= timedelta(days=1)

    # ── Type breakdown ───────────────────────────────────────────────────
    by_type: dict[str, int] = defaultdict(int)
    for w, _ in dated:
        by_type[w.get("type", "Other")] += 1

    # ── Last 8 weeks trend ───────────────────────────────────────────────
    weeks: list[dict[str, Any]] = []
    for i in range(7, -1, -1):
        ws = week_start - timedelta(weeks=i)
        we = ws + timedelta(days=7)
        wk = [w for w, d in dated if ws <= d < we]
        weeks.append(
            {
                "week": ws.isoformat(),
                "label": ws.strftime("%b %d"),
                "minutes": round(sum(float(w.get("duration_min") or 0) for w in wk), 1),
                "distance": round(sum(float(w.get("distance_mi") or 0) for w in wk), 1),
                "load": round(sum(_session_load(w) for w in wk), 1),
                "sessions": len(wk),
            }
        )

    # ── Totals ───────────────────────────────────────────────────────────
    total_distance = sum(float(w.get("distance_mi") or 0) for w, _ in dated)
    total_minutes = sum(float(w.get("duration_min") or 0) for w, _ in dated)
    avg_intensity = (
        round(sum(float(w.get("intensity") or 0) for w, _ in dated) / len(dated), 1)
        if dated
        else 0.0
    )

    return {
        "totals": {
            "sessions": len(dated),
            "distance_mi": round(total_distance, 1),
            "minutes": round(total_minutes, 1),
            "hours": round(total_minutes / 60, 1),
            "avg_intensity": avg_intensity,
        },
        "this_week": {
            "sessions": len(this_week),
            "target": weekly_target,
            "minutes": round(week_minutes, 1),
            "distance_mi": round(week_distance, 1),
            "load": round(week_load, 1),
        },
        "load": {
            "acute": round(acute, 1),
            "chronic_weekly": round(chronic_weekly, 1),
            "acwr": acwr,
            "status": _acwr_status(acwr),
        },
        "streak_days": streak,
        "by_type": dict(by_type),
        "weeks": weeks,
    }


def _acwr_status(acwr: float) -> str:
    """Sports-science sweet spot is roughly 0.8-1.3."""
    if acwr == 0:
        return "no-data"
    if acwr < 0.8:
        return "undertraining"
    if acwr <= 1.3:
        return "optimal"
    if acwr <= 1.5:
        return "caution"
    return "high-risk"
