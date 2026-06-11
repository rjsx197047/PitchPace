"""Morning readiness: a transparent 0-100 score from the daily check-in.

This is the Whoop/Oura idea done locally: sleep, perceived energy and soreness
always count; HRV and resting HR join in when the athlete logs them, judged
against their own rolling baseline rather than population norms. The weights
are deliberately simple and visible — no black box.

Pure functions over check-in dicts so the maths is trivially testable.
"""

from __future__ import annotations

from typing import Any

# Component weights (renormalised over whichever components are present).
_WEIGHTS = {
    "sleep_quantity": 0.20,
    "sleep_quality": 0.20,
    "energy": 0.20,
    "soreness": 0.25,
    "hrv": 0.10,
    "resting_hr": 0.05,
}

SLEEP_TARGET_H = 8.0


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def baselines(checkins: list[dict[str, Any]], exclude_date: str | None = None
              ) -> tuple[float | None, float | None]:
    """Rolling personal baselines (mean HRV, mean resting HR) from prior
    check-ins, excluding the day being scored."""
    hrvs = [
        float(c["hrv_ms"]) for c in checkins
        if c.get("hrv_ms") and c.get("date") != exclude_date
    ]
    rhrs = [
        float(c["resting_hr"]) for c in checkins
        if c.get("resting_hr") and c.get("date") != exclude_date
    ]
    return (
        sum(hrvs) / len(hrvs) if hrvs else None,
        sum(rhrs) / len(rhrs) if rhrs else None,
    )


def readiness(checkin: dict[str, Any],
              baseline_hrv: float | None = None,
              baseline_rhr: float | None = None) -> dict[str, Any]:
    """Score a single check-in → {score, status, components}."""
    components: dict[str, float] = {
        "sleep_quantity": _clamp(float(checkin.get("sleep_h") or 0) / SLEEP_TARGET_H),
        "sleep_quality": (int(checkin.get("sleep_quality") or 3) - 1) / 4,
        "energy": (int(checkin.get("energy") or 3) - 1) / 4,
        "soreness": (5 - int(checkin.get("soreness") or 1)) / 4,
    }
    hrv = checkin.get("hrv_ms")
    if hrv and baseline_hrv:
        # 15% below baseline → 0; 15% above → 1.
        components["hrv"] = _clamp((float(hrv) / baseline_hrv - 0.85) / 0.30)
    rhr = checkin.get("resting_hr")
    if rhr and baseline_rhr:
        # Elevated resting HR vs baseline drags the score down.
        components["resting_hr"] = _clamp((baseline_rhr / float(rhr) - 0.90) / 0.20)

    total_weight = sum(_WEIGHTS[k] for k in components)
    score = round(
        100 * sum(_WEIGHTS[k] * v for k, v in components.items()) / total_weight
    )
    return {
        "score": score,
        "status": status_for(score),
        "components": {k: round(v, 2) for k, v in components.items()},
    }


def status_for(score: int) -> str:
    if score >= 80:
        return "primed"
    if score >= 60:
        return "ready"
    if score >= 40:
        return "caution"
    return "rest-day"


def with_readiness(checkins: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Attach a readiness block to each check-in (baselines exclude that day)."""
    out = []
    for c in checkins:
        hrv_base, rhr_base = baselines(checkins, exclude_date=c.get("date"))
        out.append({**c, "readiness": readiness(c, hrv_base, rhr_base)})
    return out


def build_readiness_context(checkins: list[dict[str, Any]], days: int = 7) -> str:
    """Compact check-in block for the AI coach's system prompt."""
    if not checkins:
        return (
            "=== MORNING READINESS ===\n"
            "No check-ins logged yet. Encourage a 60-second morning check-in "
            "(sleep, energy, soreness) so daily load can be tuned to readiness."
        )
    scored = with_readiness(checkins)[:days]
    lines = []
    for c in scored:
        r = c["readiness"]
        bits = [
            f"{c['date']}: {r['score']}/100 ({r['status']})",
            f"sleep {c.get('sleep_h', 0)}h q{c.get('sleep_quality', '-')}/5",
            f"energy {c.get('energy', '-')}/5",
            f"soreness {c.get('soreness', '-')}/5",
        ]
        if c.get("sore_areas"):
            bits.append("sore: " + ", ".join(c["sore_areas"]))
        if c.get("hrv_ms"):
            bits.append(f"HRV {c['hrv_ms']}ms")
        if c.get("resting_hr"):
            bits.append(f"RHR {c['resting_hr']}")
        if c.get("notes"):
            bits.append(str(c["notes"])[:60])
        lines.append("- " + " · ".join(bits))
    return (
        "=== MORNING READINESS (latest first) ===\n"
        + "\n".join(lines)
        + "\nScale today's intensity to the latest readiness; flag any soreness "
        "area that repeats across days."
    )
