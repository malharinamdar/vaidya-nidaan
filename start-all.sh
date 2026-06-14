#!/usr/bin/env bash
# Start the full Vaidya Nidaan stack (ML service, backend gateway, frontend) and
# stream their logs. Ctrl-C stops all three.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ML_DIR="$ROOT/ml_service"
BACKEND_DIR="$ROOT/website/backend"
FRONTEND_DIR="$ROOT/website/frontend"

# Pick the ML Python interpreter (prefer the project venv).
if [ -x "$ML_DIR/.venv/bin/python" ]; then
  ML_PY="$ML_DIR/.venv/bin/python"
else
  ML_PY="$(command -v python3.12 || command -v python3)"
  echo "Warning: ml_service/.venv not found — using $ML_PY (run the install step in RUN_LOCAL.md)."
fi

pids=()
cleanup() {
  echo
  echo "Shutting down..."
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

echo "ML service   -> http://localhost:${ML_PORT:-5001}"
( cd "$ML_DIR" && "$ML_PY" app.py 2>&1 | sed 's/^/[ml]   /' ) &
pids+=($!)

echo "Backend API  -> http://localhost:5005"
( cd "$BACKEND_DIR" && npm start 2>&1 | sed 's/^/[api]  /' ) &
pids+=($!)

echo "Frontend     -> http://localhost:5173"
( cd "$FRONTEND_DIR" && npm run dev 2>&1 | sed 's/^/[web]  /' ) &
pids+=($!)

echo
echo "All services starting. Open http://localhost:5173  (Ctrl-C to stop)."
wait
