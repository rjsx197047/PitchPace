#!/usr/bin/env bash
# PitchPace — development mode with hot reload.
# Backend (FastAPI, auto-reload) on :8000, frontend (Vite, HMR) on :5181.
# Open http://localhost:5181 — Vite proxies /api to the backend.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# Prefer node@22 (default Homebrew node 25 is broken on this machine).
NODE_BIN=""
for c in /opt/homebrew/opt/node@22/bin /opt/homebrew/opt/node@20/bin; do
  if [ -x "$c/node" ] && "$c/node" --version >/dev/null 2>&1; then NODE_BIN="$c"; break; fi
done
if [ -z "$NODE_BIN" ]; then
  echo "✗ No working Node found. Install one: brew install node@22"; exit 1
fi
export PATH="$NODE_BIN:$PATH"

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "▶ Starting backend on :8000 (reload)…"
(cd backend && PITCHPACE_DEBUG=1 python3 -m uvicorn app.main:app --reload --port 8000) &

[ -d frontend/node_modules ] || (cd frontend && npm install)
echo "▶ Starting frontend on :5181 (HMR)…  →  http://localhost:5181"
(cd frontend && npm run dev) &

wait
