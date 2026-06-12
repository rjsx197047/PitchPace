"""End-to-end-encrypted device sync — without a PitchPace cloud.

The athlete exports a single `.ppsync` file encrypted with a passphrase
(AES-256-GCM, key derived via PBKDF2-HMAC-SHA256). The file is opaque before
it leaves the app, so it can travel over any channel the athlete already owns
— iCloud Drive, Dropbox, e-mail to self, USB stick, Syncthing — and be
imported on another device with the same passphrase. The passphrase is never
stored anywhere.

Import is a merge, not a wipe: rows that already exist locally (matched by a
content signature) are skipped, so syncing in both directions is safe.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from typing import Any

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app import db

MAGIC = b"PPSYNC1"
SALT_LEN = 16
NONCE_LEN = 12
PBKDF2_ITERATIONS = 200_000
MIN_PASSPHRASE_LEN = 8


def _key(passphrase: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac(
        "sha256", passphrase.encode("utf-8"), salt, PBKDF2_ITERATIONS, dklen=32
    )


def encrypt_payload(payload: dict[str, Any], passphrase: str) -> bytes:
    salt = os.urandom(SALT_LEN)
    nonce = os.urandom(NONCE_LEN)
    plaintext = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ciphertext = AESGCM(_key(passphrase, salt)).encrypt(nonce, plaintext, MAGIC)
    return MAGIC + salt + nonce + ciphertext


def decrypt_payload(blob: bytes, passphrase: str) -> dict[str, Any]:
    if not blob.startswith(MAGIC) or len(blob) < len(MAGIC) + SALT_LEN + NONCE_LEN + 16:
        raise ValueError("Not a PitchPace sync file")
    off = len(MAGIC)
    salt = blob[off : off + SALT_LEN]
    nonce = blob[off + SALT_LEN : off + SALT_LEN + NONCE_LEN]
    ciphertext = blob[off + SALT_LEN + NONCE_LEN :]
    try:
        plaintext = AESGCM(_key(passphrase, salt)).decrypt(nonce, ciphertext, MAGIC)
    except InvalidTag:
        raise ValueError("Wrong passphrase (or corrupted file)")
    return json.loads(plaintext)


# ── Payload assembly & merge ────────────────────────────────────────────────


def export_payload() -> dict[str, Any]:
    return {
        "version": 1,
        "app": "PitchPace",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "profile": db.get_profile(),
        "workouts": db.list_workouts(),
        "checkins": db.list_checkins(limit=10_000),
        "film_sessions": db.list_film_sessions(limit=10_000),
    }


def _workout_sig(w: dict[str, Any]) -> tuple:
    return (
        w.get("date"),
        w.get("type"),
        w.get("title", ""),
        round(float(w.get("duration_min") or 0), 1),
        round(float(w.get("distance_mi") or 0), 2),
        int(w.get("intensity") or 0),
    )


def _film_sig(f: dict[str, Any]) -> tuple:
    return (f.get("date"), f.get("title", ""), f.get("video_name", ""))


def merge_payload(payload: dict[str, Any]) -> dict[str, int]:
    """Insert anything we don't already have; never overwrite local rows."""
    counts = {"workouts_added": 0, "checkins_added": 0, "film_added": 0, "skipped": 0}

    existing_workouts = {_workout_sig(w) for w in db.list_workouts()}
    for w in payload.get("workouts", []):
        if _workout_sig(w) in existing_workouts:
            counts["skipped"] += 1
            continue
        db.create_workout(
            {
                "date": w.get("date"),
                "type": w.get("type", "Cross-Training"),
                "title": w.get("title", ""),
                "duration_min": w.get("duration_min", 0),
                "distance_mi": w.get("distance_mi", 0),
                "intensity": w.get("intensity", 5),
                "calories": w.get("calories"),
                "metrics": w.get("metrics") or {},
                "notes": w.get("notes", ""),
            }
        )
        existing_workouts.add(_workout_sig(w))
        counts["workouts_added"] += 1

    for c in payload.get("checkins", []):
        day = c.get("date")
        if not day or db.get_checkin(day) is not None:
            counts["skipped"] += 1
            continue
        db.upsert_checkin({**c, "date": day})
        counts["checkins_added"] += 1

    existing_film = {_film_sig(f) for f in db.list_film_sessions(limit=10_000)}
    for f in payload.get("film_sessions", []):
        if _film_sig(f) in existing_film:
            counts["skipped"] += 1
            continue
        db.create_film_session(
            {
                "date": f.get("date"),
                "title": f.get("title", ""),
                "video_name": f.get("video_name", ""),
                "workout_id": None,  # ids don't transfer across devices
                "tags": f.get("tags") or [],
                "notes": f.get("notes", ""),
            }
        )
        existing_film.add(_film_sig(f))
        counts["film_added"] += 1

    # Profile: only adopt the incoming one when ours is still pristine, so a
    # fresh device picks it up but an established one is never clobbered.
    incoming = payload.get("profile") or {}
    if incoming.get("name") and not db.get_profile().get("name"):
        db.update_profile({k: v for k, v in incoming.items() if v not in (None, "")})

    return counts
