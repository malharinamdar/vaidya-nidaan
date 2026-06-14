# Running Vaidya Nidaan locally (end‑to‑end)

This guide brings up the full system: **React frontend → Node API gateway → Python ML service**
(VGG‑19 classifier · Grad‑CAM++ · FSL biomarkers · GPT‑4 chatbot).

```
React (Vite, :5173)
   ├── auth + patient records ─────────────▶  Node/Express + MongoDB  (:5005)
   └── prediction / grad‑cam / report / chat ▶ Python Flask ML service (:5001)
                                                 ├─ TensorFlow VGG‑19 (Hugging Face)
                                                 ├─ Grad‑CAM++
                                                 ├─ FSL biomarker analysis (BET + FAST)
                                                 └─ OpenAI GPT‑4o (multilingual chat + rationale)
```

## Prerequisites
- **Node.js 18+** and **npm**
- **Python 3.12** (recommended for TensorFlow wheels on macOS arm64)
- **FSL** (optional — only for volumetric `.nii/.img` biomarker analysis; auto‑detected from `~/fsl`)
- No database to install — an **in‑memory MongoDB** starts automatically.

## 1. Configure environment
Two `.env` files are already created from the `.env.example` templates and contain working
defaults plus your keys:

- `website/backend/.env` — `PORT=5005`, `JWT_SECRET`, `MONGO_URI` (empty ⇒ in‑memory Mongo)
- `ml_service/.env` — `PORT=5001`, `HF_TOKEN`, `ALZHEIMER_MODEL_REPO`, `OPENAI_API_KEY`

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

Open **http://localhost:5173**, click **Sign Up**, create a doctor account, log in, add a patient,
then open the patient profile and use **Detect Alzheimer's**, **Grad‑CAM Analysis**, **Biomarker
Analysis**, **Full Diagnosis Report** (combined prediction + Grad‑CAM + biomarkers + AI rationale),
and **Chat with AI**.

## 4. Health checks
```bash
curl http://localhost:5005/health
curl http://localhost:5001/health   # shows classifier_backend, fsl_available, openai_enabled
```

## Using the real trained model (Hugging Face)
The ML service downloads `alzheimer_model.h5` from the private repo
`malharinamdar/alzheimer-prediction-model` on first prediction and caches it under
`ml_service/models/`. It then runs the **real VGG‑19 classifier + Grad‑CAM++**.

`GET /health` reports `"classifier_backend": "tensorflow"` when the model is loaded, or
`"numpy-fallback"` otherwise (a deterministic stand‑in so the pipeline still runs).

**If you see `numpy-fallback`**, the Hugging Face token cannot read the private model repo.
Fix the token (see below) and restart the ML service — no code changes needed.

### Hugging Face token
`HF_TOKEN` must have **Read** access to the model repo. Create/edit a token at
https://huggingface.co/settings/tokens (fine‑grained: grant *Read access to contents of
repos in your namespace*, or use a classic read token), then set it in `ml_service/.env`:
```
HF_TOKEN=hf_your_read_token
```

### Model preprocessing
`MODEL_PREPROCESS` in `ml_service/.env` controls pixel scaling (`auto`, `div255`, `raw`, `vgg19`).
It defaults to **`raw`** (0–255 pixels), matching how this VGG‑19 model was trained in
`research/notebooks/final_alzheimer_model.ipynb`. `auto` probes the bundled sample MRI and picks
the most confident mode if you are unsure.

## Endpoint reference (ML service, :5001)
| Method | Path | Body | Returns |
|--------|------|------|---------|
| POST | `/prediction` | `file` (image) | `{ prediction: { prediction, alzheimer_probability, per_class, message } }` |
| POST | `/gradcam` (and `/api/patients/:id/gradcam`) | `file` | `{ gradCamResult, mriUrl }` (data URLs) |
| POST | `/report` (and `/api/patients/:id/report`) | `file`; `?segmentation=0` to skip FAST | `{ report, biomarkers, source }` — runs FSL BET + FAST by default |
| POST | `/diagnosis` (and `/api/patients/:id/diagnosis`) | `file`; optional `patient` (JSON) | `{ prediction, gradcam, biomarkers, rationale, report, classifier_backend }` |
| POST | `/api/query1` / `/api/query2` / `/chat` | `text`, optional `file` | `{ message }` |

## Troubleshooting
- **Port already in use** — change `PORT` in the relevant `.env` (and `VITE_API_BASE` / `VITE_ML_BASE`
  in `website/frontend/.env` if you move the gateways).
- **Data resets on restart** — the in‑memory Mongo is ephemeral. Set `MONGO_URI` in
  `website/backend/.env` to a persistent MongoDB to keep data.
- **TensorFlow won't install** — use Python 3.12 (3.13 wheels are unreliable on macOS arm64).
