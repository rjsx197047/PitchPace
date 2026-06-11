"""RAG layer: aggregates, timeframe detection, FTS retrieval."""

from __future__ import annotations

from datetime import date, timedelta

from app import db, rag


def seed(days_ago: int, **overrides):
    w = {
        "date": (date.today() - timedelta(days=days_ago)).isoformat(),
        "type": "Distance Run",
        "title": "",
        "duration_min": 45,
        "distance_mi": 6.0,
        "intensity": 6,
        "metrics": {},
        "notes": "",
    }
    w.update(overrides)
    return db.create_workout(w)


def test_history_context_empty():
    assert "No sessions logged yet" in rag.build_history_context("hi", [])


def test_history_context_aggregates_and_bests():
    seed(2, duration_min=50, distance_mi=8.0)
    seed(10, type="Boxing", title="Sparring", duration_min=60,
         distance_mi=0, intensity=9, notes="6 rounds, felt sharp")
    seed(40, duration_min=30, distance_mi=3.0)

    ctx = rag.build_history_context(None, db.list_workouts())
    assert "Lifetime by activity" in ctx
    assert "Boxing: 1 sessions" in ctx
    assert "Distance Run: 2 sessions" in ctx
    assert "Personal bests" in ctx
    assert "Longest distance: 8.0 mi" in ctx
    assert "Weekly load" in ctx


def test_fts_retrieval_finds_notes():
    seed(10, type="Boxing", duration_min=60, distance_mi=0,
         notes="sparring southpaw, jab felt sharp")
    seed(5)  # an unrelated run

    ctx = rag.build_history_context(
        "How is my sparring progressing?", db.list_workouts(),
        search=db.search_workouts,
    )
    assert "Sessions matching the question" in ctx
    assert "sparring southpaw" in ctx


def test_question_window_parsing():
    today = date(2026, 6, 11)

    label, start, end = rag.question_window("how were my last 3 weeks", today)
    assert label == "last 3 weeks"
    assert (end - start).days == 21

    label, start, end = rag.question_window("compare to May", today)
    assert label == "May 2026"
    assert start == date(2026, 5, 1) and end == date(2026, 6, 1)

    label, start, end = rag.question_window("show December", today)
    assert label == "December 2025"  # months ahead of now → last year

    assert rag.question_window("how do I improve my touch", today) is None


def test_window_sessions_in_context():
    seed(3, notes="tempo on the track")
    seed(60)
    ctx = rag.build_history_context(
        "what did I do in the last 2 weeks?", db.list_workouts(),
        search=db.search_workouts,
    )
    assert "Sessions in last 2 weeks" in ctx
