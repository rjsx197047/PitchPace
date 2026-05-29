# PitchPace — single-image deploy (Railway, Fly, any container host).
# Stage 1 builds the React UI; stage 2 serves UI + API from FastAPI on $PORT.

# ── Stage 1: build the frontend ──────────────────────────────────────────
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build            # → /web/dist

# ── Stage 2: Python runtime ──────────────────────────────────────────────
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PITCHPACE_DEBUG=0

COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt

COPY backend/ backend/
# main.py serves <root>/frontend/dist when present, so the built UI and the
# API are served from one port.
COPY --from=web /web/dist frontend/dist

EXPOSE 8000
# Railway/Heroku-style platforms inject $PORT; default to 8000 locally.
CMD ["sh", "-c", "uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port ${PORT:-8000}"]
