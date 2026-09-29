# Running Vaidya Nidaan locally (end‑to‑end)

This guide brings up the full system: **React frontend → Node API gateway → Python ML service**
(VGG‑19 classifier · Grad‑CAM++ · FSL biomarkers · PubMed RAG · GPT‑4o rationale + assistant).

```
React (Vite, :5173)
   ├── auth + patients + saved reports ─────▶  Node/Express + MongoDB Atlas (:5005)
   └── prediction / grad‑cam / report / chat ▶ Python Flask ML service (:5001)
                                                 ├─ TensorFlow VGG‑19 (v2 weights)
                                                 ├─ Grad‑CAM++
                                                 ├─ FSL biomarker analysis (BET + FAST)
                                                 └─ OpenAI GPT‑4o (multilingual chat + rationale)
```

## Prerequisites
- **Node.js 18+** and **npm**
- **Python 3.12** (recommended for TensorFlow wheels on macOS arm64)
- **FSL** (optional — only for volumetric `.nii/.img` biomarker analysis; auto‑detected from `~/fsl`)
- **MongoDB**: set `MONGO_URI` to your Atlas cluster, or leave it empty and an **in‑memory MongoDB** starts automatically (not persisted).

## 1. Configure environment
Two `.env` files are already created from the `.env.example` templates and contain working
defaults plus your keys:

- `website/backend/.env` — `PORT=5005`, `JWT_SECRET`, `MONGO_URI` (empty ⇒ in‑memory Mongo), `MONGO_DB_NAME`, `CORS_ORIGINS`, `DEMO_MODE`
- `ml_service/.env` — `PORT=5001`, `ALZHEIMER_MODEL_PATH`, `MODEL_PREPROCESS`, `DECISION_THRESHOLD`, `OPENAI_API_KEY`, and the **same `JWT_SECRET`** as the backend

With `JWT_SECRET` set, every ML route needs the `Authorization: Bearer <token>` the API issues at login.
After setting `MONGO_URI`, run `npm run init-db` in `website/backend` once (indexes + demo workspace).

> ⚠️ `.env` files are git‑ignored. **Rotate the OpenAI key and HF token before any public deploy.**

## 2. Install dependencies (first time only)
```bash
# Backend
cd website/backend && npm install

# Frontend
cd ../frontend && npm install

# ML service (Python 3.12 venv)
cd ../../ml_service
python3.12 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
```

## 3. Start everything
Easiest — one command from the repo root:
```bash
./start-all.sh
```
…or run each service in its own terminal:
```bash
# Terminal 1 — ML service (:5001)
cd ml_service && ./.venv/bin/python app.py

# Terminal 2 — Backend gateway (:5005)
cd website/backend && npm start

# Terminal 3 — Frontend (:5173)
cd website/frontend && npm run dev
```

Open **http://localhost:5173** and click **Try the demo** (or sign up). Open a patient, drop an MRI
slice into the scan panel (or pick a bundled OASIS sample), then use the **Classification**,
**Grad‑CAM++**, **Biomarkers**, **Full report** and **Assistant** tabs — they all reuse the same scan.
**Generate full report** saves a printable report to the patient's history (Print → Save as PDF).

## 4. Health checks
```bash
curl http://localhost:5005/health
curl http://localhost:5001/health   # classifier_backend, fsl_available, openai_enabled, auth_required
```

## The trained model
The service runs the v2 VGG-19 classifier trained in `research/notebooks/alzheimer_model_v2.ipynb`.
Put the weights at `ml_service/models/alzheimer_vgg19_v2.keras` and keep these in `ml_service/.env`
(they are also the defaults in `.env.example`):
```
ALZHEIMER_MODEL_PATH=models/alzheimer_vgg19_v2.keras
MODEL_PREPROCESS=vgg19        # Keras ImageNet preprocess_input, as in training
DECISION_THRESHOLD=0.13       # slice-level threshold tuned on the validation patients
```
There is no heuristic fallback: if the model can't be loaded, prediction requests fail
instead of inventing a diagnosis.

The legacy v1 model (`alzheimer_model.h5`, private Hugging Face repo
`malharinamdar/alzheimer-prediction-model`) is still loadable: leave `ALZHEIMER_MODEL_PATH` blank,
set `HF_TOKEN`, `MODEL_PREPROCESS=raw` and `DECISION_THRESHOLD=0.5`.

## Endpoint reference (ML service, :5001)
| Method | Path | Body | Returns |
|--------|------|------|---------|
| POST | `/prediction` | `file` (image) | `{ prediction: { prediction, alzheimer_probability, per_class, message } }` |
| POST | `/gradcam` (and `/api/patients/:id/gradcam`) | `file` | `{ gradCamResult, mriUrl, heatmapUrl, layer, tissue_attribution_pct }` |
| POST | `/report` (and `/api/patients/:id/report`) | `file` (image or NIfTI); `?segmentation=0` to skip FAST | `{ report, biomarkers, source, native_volume }` |
| POST | `/diagnosis` (and `/api/patients/:id/diagnosis`) | `file`; optional `patient` (JSON) | `{ prediction, gradcam, biomarkers, rationale, literature, report, classifier_backend }` |
| POST | `/chat` (aliases `/api/query1`, `/api/query2`) | `text`, optional image `file`, `history` (JSON), `context` | `{ message, sources }` |

All POST routes require `Authorization: Bearer <JWT>` when `JWT_SECRET` is set, and are rate-limited per caller.

## Troubleshooting
- **Port already in use** — change `PORT` in the relevant `.env` (and `VITE_API_BASE` / `VITE_ML_BASE`
  in `website/frontend/.env` if you move the gateways).
- **Data resets on restart** — you're on the in‑memory Mongo. Set `MONGO_URI` in
  `website/backend/.env` to your Atlas cluster to keep data.
- **401 from the ML service** — `JWT_SECRET` differs between `website/backend/.env` and `ml_service/.env`.
- **TensorFlow breaks after installing packages** — re-pin `protobuf==5.29.6` (chromadb pulls protobuf 7).
- **TensorFlow won't install** — use Python 3.12 (3.13 wheels are unreliable on macOS arm64).
