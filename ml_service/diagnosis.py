"""Combined diagnostic report: model prediction + Grad-CAM++ + FSL biomarkers + LLM rationale.

Orchestrates the full pipeline for a single MRI upload and returns a structured
report the frontend can render and download.
"""
from datetime import datetime, timezone

import inference
import report as report_mod
import chatbot


def _structured_text(prediction, biomarkers, biomarker_report, rationale, patient, source, citations=None):
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
        "4. CLINICAL RATIONALE (LLM, grounded in retrieved literature)",
        rationale,
    ]
    if citations:
        lines += ["", "5. RELATED LITERATURE (topically retrieved via RAG from PubMed/MEDLINE - for reference)"]
        for c in citations:
            lines.append(f"  [{c['n']}] {c['title']} ({c['year']}) {c.get('url', '')}".rstrip())
    lines += [
        "",
        "Note: Decision-support tool - NOT a diagnosis. Confirm with a qualified",
        "radiologist / neurologist before any clinical decision.",
    ]
    return "\n".join(lines)


def _retrieve_literature(prediction, biomarkers, k=3):
    """RAG grounding: retrieve papers relevant to the findings for the rationale.

    Returns (formatted_block, citations). Fails soft — if the RAG store or network is
    unavailable the rationale is still generated, just without literature grounding.
    """
    try:
        import medical_rag

        label = prediction.get("prediction", "")
        query = (
            "MRI structural biomarkers of Alzheimer's disease: grey matter atrophy, "
            f"GM:WM ratio, CSF fraction and hippocampal volume ({label})"
        )
        hits = medical_rag.retrieve(query, k=k)
    except Exception as exc:  # store missing / offline / import error
        print(f"[diagnosis] literature retrieval unavailable ({exc}); rationale runs ungrounded.")
        return None, []
    if not hits:
        return None, []
    formatted = "\n".join(
        f"[{i + 1}] {h['title']} ({h['year']}): {h['abstract'][:500]}" for i, h in enumerate(hits)
    )
    citations = [
        {"n": i + 1, "title": h["title"], "year": h["year"], "url": h.get("url", ""),
         "distance": round(h["distance"], 3)}
        for i, h in enumerate(hits)
    ]
    return formatted, citations


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
        f"A Grad-CAM++ heatmap was generated over the last VGG-19 conv block (block5_conv4) for the "
        f"'{top_class}' prediction. This text summary does NOT describe where the heatmap focused; "
        "its anatomical location must be reviewed visually and must not be assumed to be correct."
    )

    # 3) FSL biomarkers
    rep = report_mod.generate_report(file_bytes, filename, run_segmentation=run_segmentation)
    biomarkers = rep["biomarkers"]

    # 3.5) RAG: retrieve supporting literature to ground the rationale
    literature, lit_citations = _retrieve_literature(prediction, biomarkers)

    # 4) Grounded LLM clinical rationale (prediction + biomarkers + retrieved literature)
    rationale = chatbot.generate_rationale(
        prediction, biomarkers, patient=patient,
        gradcam_summary=gradcam_summary, literature=literature,
    )

    full_text = _structured_text(
        prediction, biomarkers, rep["report"], rationale, patient, rep["source"], lit_citations
    )

    return {
        "prediction": prediction,
        "gradcam": {"gradCamResult": overlay_url, "mriUrl": mri_url},
        "biomarkers": biomarkers,
        "biomarker_report": rep["report"],
        "biomarker_source": rep["source"],
        "native_volume": rep.get("native_volume", False),
        "rationale": rationale,
        "literature": lit_citations,
        "report": full_text,
        "classifier_backend": inference.backend_name(),
    }
