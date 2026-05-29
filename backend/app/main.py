"""FastAPI application entry point.

Serves the JSON API under /api. In dev, the Vite server proxies /api here.
If a production build exists at frontend/dist, it's also served so the whole
app can run from a single port.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import db
from app.config import BASE_DIR
from app.routes import router

app = FastAPI(title="PitchPace", version="1.0.0")

# Security headers applied to every response (UI + API). CSP keeps scripts
# same-origin; 'unsafe-inline' is allowed only for styles because React sets
# inline `style` attributes (chart bar heights, the ACWR gauge, etc.).
SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self'; base-uri 'self'; form-action 'self'; "
        "frame-ancestors 'none'; object-src 'none'; "
        "img-src 'self' data:; font-src 'self'; connect-src 'self'; "
        "script-src 'self'; style-src 'self' 'unsafe-inline'"
    ),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
}


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    for key, value in SECURITY_HEADERS.items():
        response.headers.setdefault(key, value)
    return response


# Permissive CORS for local dev (Vite on a different port).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    db.init_db()


app.include_router(router, prefix="/api")

# Optionally serve the built SPA (only if it's been built).
_dist = BASE_DIR.parent / "frontend" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="spa")
