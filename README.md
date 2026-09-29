# Vaidya Nidaan

*"Vaidya Nidaan" is Sanskrit for "medical diagnosis".*

> 🏅 **3rd place** of 400+ teams at PICT Techfiesta 2025
>
> **Live demo → [vaidya-nidaan.vercel.app](https://vaidya-nidaan.vercel.app)** (click *Try the demo* — no sign-up)

**Explainable decision support for Alzheimer's MRI.** Upload one axial brain-MRI slice and Vaidya Nidaan:

1. **classifies** it (Demented vs Non-demented) with a transfer-learned VGG-19,
2. **explains** the decision with Grad-CAM++ you can fade over the anatomy,
3. **measures** tissue composition with FSL (BET + FAST),
4. **drafts a clinical rationale** with GPT-4o, grounded in PubMed/MEDLINE abstracts it retrieves and cites,

…and saves everything as a printable report in the patient's history. A multilingual assistant (English, Hindi,
Marathi, …) answers follow-up questions with PubMed citations; conversations are saved per patient.

![Landing page](docs/images/v2/landing.jpg)

| Patient workspace · Grad-CAM++ | Printable diagnosis report |
|---|---|
| ![Grad-CAM++ in the patient workspace](docs/images/v2/gradcam.jpg) | ![Diagnosis report](docs/images/v2/report.jpg) |
| **FSL tissue biomarkers** | **PubMed-grounded assistant** |
| ![Biomarkers](docs/images/v2/biomarkers.jpg) | ![Assistant](docs/images/v2/assistant.jpg) |

---

## What's inside

| Layer | What it does |
|---|---|
| **Classifier** | VGG-19 (ImageNet, last block fine-tuned) + dense head (256 → 128 → softmax) on 128 × 128 axial slices; binary decision, Demented vs Non-demented, at a threshold tuned on validation patients. |
| **Explainability** | Grad-CAM++ on `block5_conv4`, computed on the pre-softmax **log-odds** of the predicted class (softmax gradients vanish on confident predictions), rendered as an adjustable overlay. |
| **Tissue biomarkers** | FSL BET + FAST (3-class, T1) with partial-volume-weighted tissue amounts: CSF / grey / white-matter fractions, GM:WM ratio and parenchymal fraction for 2D slices, plus volumes for 3D NIfTI uploads. |
| **RAG** | 513 PubMed/MEDLINE abstracts (NCBI E-utilities) in a persisted ChromaDB index with cosine retrieval and an out-of-domain refusal floor, used by both the report rationale and the assistant. `eval_rag.py` checks retrieval relevance, citation and refusal (9/9). |
| **Clinical rationale** | GPT-4o writes a structured interpretation — impression, classifier and Grad-CAM++ interpretation, tissue biomarkers vs Alzheimer's atrophy patterns, risk profile, a synthesis of 5 retrieved PubMed abstracts with [n] citations, differential diagnosis and recommended work-up. |
| **Assistant** | GPT-4o chat with conversation memory, image attachments and PubMed grounding; conversations are stored in MongoDB per patient. |
| **Caching** | Deterministic outputs (classification, Grad-CAM++, FSL, full report, repeated questions) are cached by input hash — Redis when `REDIS_URL` is set, else in-process. A repeat request drops from ~4 s to a few ms. |
| **Input check** | Two stages before any analysis: pixel heuristics, then a Mahalanobis out-of-distribution test on VGG-19 `block4_pool` features fitted to OASIS slices (`build_ood_stats.py`). Screenshots, photos and documents are rejected in the UI as "not a brain MRI". |
| **Citation verification** | A second pass (`gpt-4o-mini`) checks every cited sentence in the rationale and assistant replies against the cited abstract and removes unsupported citations. |

### Data and model

- **Dataset:** OASIS-1 brain MRI scans ([imagesOASIS](https://www.kaggle.com/datasets/ninadaithal/imagesoasis) on Kaggle): 86,437 axial MRI slices from 347 people, 81 with dementia and 266 without.
- **Model:** VGG-19 pretrained on ImageNet (transfer learning), with the last convolutional block fine-tuned to classify a slice as Demented or Non-demented. It is trained and tested on different patients.
- **Notebook:** [`alzheimer_model_v2.ipynb`](research/notebooks/alzheimer_model_v2.ipynb) trains the model.

---

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[React + Vite SPA]
  end
  UI -- JWT --> API[Node/Express API<br/>auth · patients · reports]
  API --> DB[(MongoDB Atlas)]
  UI -- same JWT --> ML[Flask ML service]
  ML --> CLS[VGG-19 classifier]
  ML --> CAM[Grad-CAM++]
  ML --> FSL[FSL BET + FAST]
  ML --> RAG[(Chroma · 513 PubMed abstracts)]
  ML --> LLM[GPT-4o rationale + assistant]
```

- **Frontend** — React 18, Vite, Tailwind v4, Framer Motion. It has one patient workspace (upload a scan once; every tab reuses it) and a print-to-PDF report view.
- **API gateway** — Express + Mongoose. It handles JWT auth (a Bearer token in localStorage), patient CRUD, saved reports, and a one-click shared demo workspace (`DEMO_MODE`).
- **ML service** — Flask on [Modal](https://modal.com) (scale-to-zero). Every POST route verifies the gateway's JWT and is rate-limited per caller.
- **Hosting** — frontend and API on Vercel, database on MongoDB Atlas.

## Run locally

Prerequisites: Node 18+, Python 3.12, and optionally [FSL](https://fsl.fmrib.ox.ac.uk/fsl/docs/#/install/index) (auto-detected at `~/fsl`; without it, biomarkers fall back to image statistics).

```bash
git clone https://github.com/malharinamdar/vaidya-nidaan.git && cd vaidya-nidaan

# API gateway
cd website/backend && npm install && cp .env.example .env   # set JWT_SECRET; MONGO_URI optional
npm run init-db                                              # indexes + demo workspace (needs MONGO_URI)

# Frontend
cd ../frontend && npm install

# ML service
cd ../../ml_service && python3.12 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
cp .env.example .env   # set OPENAI_API_KEY and the SAME JWT_SECRET; weights go in models/ (from the v2 notebook)

cd .. && ./start-all.sh   # frontend :5173 · API :5005 · ML :5001
```

With `MONGO_URI` empty, the API starts an in-memory MongoDB (nothing is persisted). Open http://localhost:5173 and click **Try the demo**.

## Repository

```text
website/frontend   React SPA (pages/, components/, lib/)
website/backend    Express API (app.js, routes/, models/, lib/, api/index.js for Vercel)
ml_service         Flask ML service (app.py, inference.py, report.py, diagnosis.py,
                   chatbot.py, medical_rag.py, security.py, mri_check.py, modal_app.py)
research           Training notebooks (v1, v2), v2 test results, FSL report notebook, Grad-CAM++ and FSL scripts
docs               Screenshots, sample scans, architecture diagrams
```

## Team

**Team MarkerMinds** — Malhar Inamdar (maintainer · [malharinamdar.github.io](https://malharinamdar.github.io)), Manorama Mudgal, Vedant Joshi, Prajwal Mandlecha, Aditya Bhalgat.
