#!/usr/bin/env bash
# PitchPace — one-command launcher (single port).
# Builds the React frontend, then serves the whole app (UI + API) from FastAPI
# on http://localhost:8000.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ── Pick a working Node (the default Homebrew node 25 on this machine is
#    broken — missing libsimdjson — so prefer node@22 if present). ──────────
NODE_BIN=""
for c in /opt/homebrew/opt/node@22/bin /opt/homebrew/opt/node@20/bin; do
  if [ -x "$c/node" ] && "$c/node" --version >/dev/null 2>&1; then
    NODE_BIN="$c"; break
  fi
done
if [ -z "$NODE_BIN" ] && command -v node >/dev/null 2>&1 && node --version >/dev/null 2>&1; then
  NODE_BIN="$(dirname "$(command -v node)")"
fi

# ── Build the frontend if needed (or when --build is passed) ───────────────
if [ ! -d frontend/dist ] || [ "${1:-}" = "--build" ]; then
  if [ -n "$NODE_BIN" ]; then
    echo "▶ Building frontend with node $("$NODE_BIN/node" -v)…"
    export PATH="$NODE_BIN:$PATH"
    (cd frontend && [ -d node_modules ] || npm install)
    (cd frontend && npm run build)
  else
    echo "⚠ No working Node found — serving the existing build in frontend/dist."
    echo "  Install Node 20/22 (e.g. 'brew install node@22') to rebuild the UI."
  fi
fi

# ── Serve everything on one port ───────────────────────────────────────────
# The database is created automatically on first request and starts empty —
# your stats grow as you log sessions.
echo ""
echo "  PitchPace is running →  http://localhost:8000"
echo "  (Ctrl+C to stop)"
echo ""
exec python3 -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
