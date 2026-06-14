"""Combined diagnostic report: model prediction + Grad-CAM++ + FSL biomarkers + LLM rationale.

Orchestrates the full pipeline for a single MRI upload and returns a structured
report the frontend can render and download.
"""
from datetime import datetime, timezone

import inference
import report as report_mod
import chatbot


def _structured_text(prediction, biomarkers, biomarker_report, rationale, patient, source):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    per_class = prediction.get("per_class", {})
    lines = [
        "VAIDYA NIDAAN - STRUCTURED MEDICAL DIAGNOSIS REPORT",
        f"Generated: {ts}",
    ]
    if patient:
        lines.append("")
        lines.append("PATIENT")
        for k, v in patient.items():
            lines.append(f"  {k.replace('_',' ').title()}: {v}")
    lines += [
        "",
        "1. AI MODEL PREDICTION (VGG-19 Alzheimer classifier)",
        f"  Predicted class      : {prediction.get('prediction')}",
        f"  Dementia probability : {prediction.get('alzheimer_probability')}%",
        "  Per-class probabilities:",
    ]
    for k, v in per_class.items():
        lines.append(f"     - {k}: {v}%")
    lines += [
        "",
        "2. EXPLAINABILITY (Grad-CAM++)",
        "  Heatmap generated over the last VGG-19 convolutional block",
        "  (block5_conv4) highlighting the regions that most influenced the",
        "  prediction. See the overlay image in the report view.",
        "",
        f"3. BIOMARKER ANALYSIS ({source})",
    ]
    for k, v in biomarkers.items():
        lines.append(f"  {k.replace('_',' ').title()}: {v}")
    lines += [
        "",
        "4. CLINICAL RATIONALE (LLM)",
        rationale,
        "",
        "Note: Decision-support tool - NOT a diagnosis. Confirm with a qualified",
        "radiologist / neurologist before any clinical decision.",
    ]
    return "\n".join(lines)


def run_diagnosis(file_bytes, filename, patient=None, run_segmentation=True):
    # 1) Classification
    label, prob, per_class, message = inference.classify(file_bytes)
    prediction = {
        "prediction": label,
        "alzheimer_probability": prob,
        "per_class": per_class,
        "message": message,
    }

    # 2) Grad-CAM++ overlay
    overlay_url, mri_url = inference.grad_cam(file_bytes)
    top_class = max(per_class, key=per_class.get) if per_class else label
    gradcam_summary = (
        f"The Grad-CAM++ heatmap emphasises the regions driving the '{top_class}' "
        "prediction on the last VGG-19 conv block (block5_conv4)."
    )

    # 3) FSL biomarkers
    rep = report_mod.generate_report(file_bytes, filename, run_segmentation=run_segmentation)
    biomarkers = rep["biomarkers"]

    # 4) LLM clinical rationale (prediction + biomarkers as context)
    rationale = chatbot.generate_rationale(
        prediction, biomarkers, patient=patient, gradcam_summary=gradcam_summary
    )

    full_text = _structured_text(
        prediction, biomarkers, rep["report"], rationale, patient, rep["source"]
    )

    return {
        "prediction": prediction,
        "gradcam": {"gradCamResult": overlay_url, "mriUrl": mri_url},
        "biomarkers": biomarkers,
        "biomarker_report": rep["report"],
        "biomarker_source": rep["source"],
        "native_volume": rep.get("native_volume", False),
        "rationale": rationale,
        "report": full_text,
        "classifier_backend": inference.backend_name(),
    }
