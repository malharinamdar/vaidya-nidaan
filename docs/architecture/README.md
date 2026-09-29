# Vaidya Nidaan — Architecture Diagrams (Excalidraw)

Two editable Excalidraw scenes describing the system.

## How to open / edit
1. Go to **https://excalidraw.com**
2. Menu (top-left) → **Open** → pick the `.excalidraw` file
   (or just **drag the file** onto the canvas)
3. Everything is editable — drag boxes, retype labels, recolor. Export via
   Menu → *Save as image* (PNG/SVG) if you want a static copy for slides.

## The two diagrams
- **`1_system_overview.excalidraw`** — the whole product in a nutshell: doctor
  logs in → creates a patient → uploads an MRI → gets a report. Shows the 3
  services (React frontend, Node gateway, Flask ML) + MongoDB, and the key idea
  that the browser talks to *both* backends.
- **`2_flask_ml_service.excalidraw`** — inside the Flask ML service: how the Full
  Diagnosis Report is orchestrated across the 4 pipelines (Classifier, Grad-CAM++,
  FSL biomarkers, RAG), the RAG pipeline in detail (PubMed → Chroma → retrieve →
  guardrail → grounded gpt-4o), the chatbot, guardrails, and external deps.
