"""Parse wearable / fitness-app exports into workout drafts.

Supported:
  * Garmin / generic TCX  (.tcx)
  * Strava / generic GPX  (.gpx)
  * Garmin FIT            (.fit, via the pure-Python `fitparse` package)
  * Apple Health export   (export.xml, or the export.zip it ships in)

Everything returns *drafts* shaped like WorkoutCreate — the user reviews and
confirms in the UI before anything is saved. Parsing happens locally; the file
never leaves the user's machine.
"""

from __future__ import annotations

import io
import math
import zipfile
from datetime import datetime
from typing import Any
from xml.etree import ElementTree as ET

MAX_WORKOUTS = 100

# Map source activity names → PitchPace workout types (see models.WORKOUT_TYPES).
_TCX_SPORTS = {
    "running": "Distance Run",
    "biking": "Cross-Training",
}
_FIT_SPORTS = {
    "running": "Distance Run",
    "cycling": "Cross-Training",
    "swimming": "Cross-Training",
    "soccer": "Match",
    "training": "Strength & Power",
    "boxing": "Boxing",
    "track": "Sprint / Track Session",
}
_APPLE_TYPES = {
    "Running": "Distance Run",
    "Soccer": "Match",
    "TrackAndField": "Sprint / Track Session",
    "TraditionalStrengthTraining": "Weightlifting",
    "FunctionalStrengthTraining": "Strength & Power",
    "HighIntensityIntervalTraining": "Plyometrics",
    "Boxing": "Boxing",
    "Kickboxing": "Boxing",
    "MartialArts": "Boxing",
    "Cycling": "Cross-Training",
    "Swimming": "Cross-Training",
    "Rowing": "Cross-Training",
    "Elliptical": "Cross-Training",
    "Walking": "Recovery / Mobility",
    "Yoga": "Recovery / Mobility",
    "FlexibilityWorkout": "Recovery / Mobility",
    "Cooldown": "Recovery / Mobility",
    "CrossTraining": "Cross-Training",
}


def _intensity_from_hr(avg_hr: float | None) -> int:
    """Rough RPE estimate from average heart rate; user adjusts on review."""
    if not avg_hr:
        return 5
    for ceiling, rpe in ((110, 3), (130, 4), (145, 5), (155, 6), (168, 7), (180, 8)):
        if avg_hr < ceiling:
            return rpe
    return 9


def _pace_str(duration_min: float, distance_mi: float) -> str | None:
    if duration_min <= 0 or distance_mi < 0.5:
        return None
    pace = duration_min / distance_mi
    return f"{int(pace)}:{round((pace % 1) * 60):02d}"


def _draft(
    *,
    source: str,
    type_: str,
    date: str,
    duration_min: float,
    distance_mi: float = 0.0,
    calories: int | None = None,
    avg_hr: float | None = None,
    max_hr: float | None = None,
    title: str = "",
) -> dict[str, Any]:
    metrics: dict[str, Any] = {"source": source}
    if avg_hr:
        metrics["avg_hr"] = round(avg_hr)
    if max_hr:
        metrics["max_hr"] = round(max_hr)
    pace = _pace_str(duration_min, distance_mi)
    if pace:
        metrics["avg_pace"] = pace
    note_bits = [f"Imported from {source}"]
    if avg_hr:
        note_bits.append(f"avg HR {round(avg_hr)}")
    if max_hr:
        note_bits.append(f"max HR {round(max_hr)}")
    return {
        "date": date,
        "type": type_,
        "title": title,
        "duration_min": round(duration_min, 1),
        "distance_mi": round(distance_mi, 2),
        "intensity": _intensity_from_hr(avg_hr),
        "calories": calories,
        "metrics": metrics,
        "notes": " · ".join(note_bits),
    }


# ── TCX ─────────────────────────────────────────────────────────────────────


def parse_tcx(data: bytes) -> list[dict[str, Any]]:
    root = ET.fromstring(data)
    drafts = []
    for activity in root.findall(".//{*}Activity"):
        sport = (activity.get("Sport") or "Other").lower()
        total_s = 0.0
        total_m = 0.0
        calories = 0
        hr_values: list[float] = []
        max_hr = 0.0
        start = None
        for lap in activity.findall("{*}Lap"):
            start = start or lap.get("StartTime")
            t = lap.find("{*}TotalTimeSeconds")
            d = lap.find("{*}DistanceMeters")
            c = lap.find("{*}Calories")
            ah = lap.find("{*}AverageHeartRateBpm/{*}Value")
            mh = lap.find("{*}MaximumHeartRateBpm/{*}Value")
            total_s += float(t.text) if t is not None and t.text else 0
            total_m += float(d.text) if d is not None and d.text else 0
            calories += int(float(c.text)) if c is not None and c.text else 0
            if ah is not None and ah.text:
                hr_values.append(float(ah.text))
            if mh is not None and mh.text:
                max_hr = max(max_hr, float(mh.text))
        if total_s <= 0:
            continue
        date = (start or "")[:10] or datetime.now().date().isoformat()
        drafts.append(
            _draft(
                source="Garmin TCX",
                type_=_TCX_SPORTS.get(sport, "Cross-Training"),
                date=date,
                duration_min=total_s / 60,
                distance_mi=total_m / 1609.344,
                calories=calories or None,
                avg_hr=sum(hr_values) / len(hr_values) if hr_values else None,
                max_hr=max_hr or None,
            )
        )
    if not drafts:
        raise ValueError("No activities found in TCX file")
    return drafts


# ── GPX ─────────────────────────────────────────────────────────────────────


def _haversine_mi(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 3958.8  # earth radius, miles
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def parse_gpx(data: bytes) -> list[dict[str, Any]]:
    root = ET.fromstring(data)
    drafts = []
    for trk in root.findall(".//{*}trk"):
        name = trk.find("{*}name")
        trk_type = trk.find("{*}type")
        points: list[tuple[float, float, datetime | None, float | None]] = []
        for pt in trk.findall(".//{*}trkpt"):
            lat, lon = float(pt.get("lat", 0)), float(pt.get("lon", 0))
            tm_el = pt.find("{*}time")
            tm = None
            if tm_el is not None and tm_el.text:
                try:
                    tm = datetime.fromisoformat(tm_el.text.replace("Z", "+00:00"))
                except ValueError:
                    tm = None
            hr_el = pt.find(".//{*}hr")
            hr = float(hr_el.text) if hr_el is not None and hr_el.text else None
            points.append((lat, lon, tm, hr))
        if len(points) < 2:
            continue
        distance = sum(
            _haversine_mi(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1])
            for i in range(1, len(points))
        )
        times = [p[2] for p in points if p[2] is not None]
        duration_min = (
            (max(times) - min(times)).total_seconds() / 60 if len(times) >= 2 else 0
        )
        hrs = [p[3] for p in points if p[3]]
        kind = (trk_type.text or "").lower() if trk_type is not None and trk_type.text else ""
        type_ = "Distance Run" if ("run" in kind or not kind) else "Cross-Training"
        drafts.append(
            _draft(
                source="GPX",
                type_=type_,
                date=(min(times).date().isoformat() if times
                      else datetime.now().date().isoformat()),
                duration_min=duration_min,
                distance_mi=distance,
                avg_hr=sum(hrs) / len(hrs) if hrs else None,
                max_hr=max(hrs) if hrs else None,
                title=(name.text or "").strip() if name is not None and name.text else "",
            )
        )
    if not drafts:
        raise ValueError("No tracks found in GPX file")
    return drafts


# ── FIT ─────────────────────────────────────────────────────────────────────


def parse_fit(data: bytes) -> list[dict[str, Any]]:
    try:
        from fitparse import FitFile
    except ImportError as e:  # pragma: no cover - dependency is in requirements
        raise ValueError(
            "FIT support needs the 'fitparse' package (pip install fitparse)"
        ) from e
    try:
        fit = FitFile(io.BytesIO(data))
        sessions = list(fit.get_messages("session"))
    except Exception as e:  # fitparse raises a small zoo of errors on bad input
        raise ValueError(f"Could not parse FIT file: {e}") from e

    drafts = []
    for s in sessions:
        vals = {f.name: f.value for f in s}
        seconds = vals.get("total_timer_time") or vals.get("total_elapsed_time") or 0
        if not seconds:
            continue
        start = vals.get("start_time")
        date = (
            start.date().isoformat()
            if isinstance(start, datetime)
            else datetime.now().date().isoformat()
        )
        meters = float(vals.get("total_distance") or 0)
        sport = str(vals.get("sport") or "").lower()
        drafts.append(
            _draft(
                source="Garmin FIT",
                type_=_FIT_SPORTS.get(sport, "Cross-Training"),
                date=date,
                duration_min=float(seconds) / 60,
                distance_mi=meters / 1609.344,
                calories=int(vals["total_calories"]) if vals.get("total_calories") else None,
                avg_hr=float(vals["avg_heart_rate"]) if vals.get("avg_heart_rate") else None,
                max_hr=float(vals["max_heart_rate"]) if vals.get("max_heart_rate") else None,
            )
        )
    if not drafts:
        raise ValueError("No session records found in FIT file")
    return drafts


# ── Apple Health ────────────────────────────────────────────────────────────


def parse_apple_health(data: bytes) -> list[dict[str, Any]]:
    drafts = []
    for _, el in ET.iterparse(io.BytesIO(data)):
        if el.tag != "Workout":
            continue
        activity = (el.get("workoutActivityType") or "").replace(
            "HKWorkoutActivityType", ""
        )
        duration = float(el.get("duration") or 0)  # exported in minutes
        distance = float(el.get("totalDistance") or 0)  # exported in miles
        calories = float(el.get("totalEnergyBurned") or 0)
        # Newer exports move totals into child WorkoutStatistics elements.
        for stat in el.findall("WorkoutStatistics"):
            st = stat.get("type") or ""
            if "DistanceWalkingRunning" in st or "DistanceCycling" in st:
                distance = distance or float(stat.get("sum") or 0)
            if "ActiveEnergyBurned" in st:
                calories = calories or float(stat.get("sum") or 0)
        start = (el.get("startDate") or "")[:10]
        el.clear()  # keep memory flat on multi-hundred-MB exports
        if duration <= 0 or not start:
            continue
        drafts.append(
            _draft(
                source="Apple Health",
                type_=_APPLE_TYPES.get(activity, "Cross-Training"),
                date=start,
                duration_min=duration,
                distance_mi=distance,
                calories=int(calories) or None,
                title=activity,
            )
        )
    if not drafts:
        raise ValueError("No workouts found in Apple Health export")
    drafts.sort(key=lambda d: d["date"], reverse=True)
    return drafts[:MAX_WORKOUTS]


# ── Dispatch ────────────────────────────────────────────────────────────────


def parse_upload(filename: str, data: bytes) -> dict[str, Any]:
    """Detect the format (extension first, then content) and parse."""
    if not data:
        raise ValueError("Empty file")
    name = (filename or "").lower()

    if name.endswith(".zip") or data[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            names = z.namelist()
            health = [n for n in names if n.endswith("export.xml")]
            if health:
                return {"source": "apple_health",
                        "workouts": parse_apple_health(z.read(health[0]))}
            inner = [n for n in names if n.lower().endswith((".tcx", ".gpx", ".fit"))]
            if len(inner) == 1:
                return parse_upload(inner[0], z.read(inner[0]))
            raise ValueError("ZIP doesn't contain an Apple Health export.xml")

    if name.endswith(".tcx") or b"<TrainingCenterDatabase" in data[:2000]:
        return {"source": "tcx", "workouts": parse_tcx(data)}
    if name.endswith(".gpx") or b"<gpx" in data[:2000]:
        return {"source": "gpx", "workouts": parse_gpx(data)}
    if name.endswith(".fit") or (len(data) > 12 and data[8:12] == b".FIT"):
        return {"source": "fit", "workouts": parse_fit(data)}
    if name.endswith(".xml") or b"<HealthData" in data[:2000]:
        return {"source": "apple_health", "workouts": parse_apple_health(data)}

    raise ValueError(
        "Unsupported file type — use .tcx, .gpx, .fit, or an Apple Health "
        "export (.xml / export.zip)"
    )
