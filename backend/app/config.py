"""Runtime settings. Mirrors the lightweight config pattern used across the
other apps in this workspace (Reading / TradingAgentsLab / QA Engineer)."""

from __future__ import annotations

import os
from pathlib import Path

# Project paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "pitchpace.db"


class Settings:
    """Plain settings object (no pydantic dependency needed here)."""

    host: str = os.getenv("PITCHPACE_HOST", "127.0.0.1")
    port: int = int(os.getenv("PITCHPACE_PORT", "8000"))
    debug: bool = os.getenv("PITCHPACE_DEBUG", "1") == "1"

    # Local Ollama fallback (used when no Claude key is supplied per-request).
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "llama3.2")

    # Optional server-side Claude key. Per-request keys always take priority;
    # this is only a fallback so the app can run fully AI-enabled headless.
    claude_api_key: str | None = os.getenv("ANTHROPIC_API_KEY") or os.getenv(
        "CLAUDE_API_KEY"
    )


settings = Settings()
