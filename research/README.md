# Research artifacts

The original experimentation behind Vaidya Nidaan — model training, Grad-CAM++,
FSL reporting and the RAG chatbot. These are kept for reference; the runnable
application reimplements this logic as a service in [`../ml_service`](../ml_service).

```
research/
├── notebooks/
│   ├── alzheimer_model_v2.ipynb      # v2 classifier (deployed): patient-level split, class weights, block5 fine-tuning
│   ├── final_alzheimer_model.ipynb   # v1 classifier (slice-level split)
│   ├── chatbot_rag.ipynb             # GPT-4 + ChromaDB RAG chatbot experiments
│   └── report.ipynb                  # FSL medical-report generation
├── results/v2/                       # v2 test metrics (with bootstrap CIs), per-patient predictions, split
└── scripts/
    ├── feature_image_model.py        # Multimodal (image + tabular) model
    ├── gradcam_plus_plus.py          # Grad-CAM++ heatmap implementation
    └── fsl_report.py                 # FSL biomarker report (BET/FAST/FIRST)
```

> Note: these scripts/notebooks contain hard-coded local paths from the original
> authors' machines and are not wired into the app. See `ml_service/` for the
> production implementations used by the live system.
