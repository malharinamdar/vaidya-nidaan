#!/usr/bin/env bash
# Create/refresh the Modal secret from ml_service/.env and deploy the ML service.
#   ./deploy_modal.sh https://<your-frontend>.vercel.app
# Requires: .modal-venv with `modal` installed and `modal token new` done once.
set -euo pipefail
cd "$(dirname "$0")"
FRONTEND_ORIGIN="${1:?usage: ./deploy_modal.sh <frontend origin, e.g. https://vaidya-nidaan.vercel.app>}"
MODAL=./.modal-venv/bin/modal

get() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
OPENAI_API_KEY="$(get OPENAI_API_KEY)"
JWT_SECRET="$(get JWT_SECRET)"
[ -n "$OPENAI_API_KEY" ] || { echo "OPENAI_API_KEY missing in .env"; exit 1; }
[ -n "$JWT_SECRET" ] || { echo "JWT_SECRET missing in .env"; exit 1; }
[ -f models/alzheimer_model.h5 ] || { echo "models/alzheimer_model.h5 not found"; exit 1; }

"$MODAL" secret create vaidya-nidaan --force \
  OPENAI_API_KEY="$OPENAI_API_KEY" \
  JWT_SECRET="$JWT_SECRET" \
  CORS_ORIGINS="$FRONTEND_ORIGIN,http://localhost:5173" >/dev/null
echo "Secret 'vaidya-nidaan' updated."

"$MODAL" deploy modal_app.py
