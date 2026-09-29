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
        "  Map over the last VGG-19 convolutional block (block5_conv4), target = binary",
        "  log-odds of the predicted class. See the overlay image in the report view.",
        "",
        f"3. TISSUE BIOMARKERS ({source})",
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
        "AI-generated decision-support report for research and education;",
        "to be reviewed by a qualified clinician.",
    ]
    return "\n".join(lines)


def _retrieve_literature(prediction, biomarkers, patient=None, k=5):
    """RAG grounding: retrieve papers relevant to the findings for the rationale.

    Returns (formatted_block, citations). Fails soft — if the RAG store or network is
    unavailable the rationale is still generated, just without literature grounding.
    """
    try:
        import medical_rag

        label = prediction.get("prediction", "")
        focus = ["grey matter atrophy", "GM:WM ratio", "CSF fraction", "hippocampal volume"]
        csf = biomarkers.get("csf_fraction_pct")
        if isinstance(csf, (int, float)) and csf >= 25:
            focus.insert(0, "ventricular enlargement and increased CSF")
        topic = ("structural MRI findings distinguishing Alzheimer's dementia from healthy ageing"
                 if label == "Demented" else "structural MRI in cognitively normal older adults versus early Alzheimer's")
        p = patient or {}
        if str(p.get("neurological_history", "")).lower() == "yes":
            focus.append("vascular contribution and white matter hyperintensities")
        if str(p.get("alcohol", "")).lower() == "high":
            focus.append("alcohol-related brain atrophy")
        query = f"{topic}: " + ", ".join(focus)
        hits = medical_rag.retrieve(query, k=k)
    except Exception as exc:  # store missing / offline / import error
        print(f"[diagnosis] literature retrieval unavailable ({exc}); rationale runs ungrounded.")
        return None, []
    if not hits:
        return None, []
    formatted = "\n".join(
        f"[{i + 1}] {h['title']} ({h['year']}): {h['abstract'][:1100]}" for i, h in enumerate(hits)
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

    # 2) Grad-CAM++ overlay (binary log-odds target on block5_conv4)
    cam = inference.grad_cam(file_bytes)
    tissue_pct = cam.get("tissue_attribution_pct")
    focality = "focal" if cam["hot_area_pct"] < 15 else ("moderately spread" if cam["hot_area_pct"] < 35 else "diffuse")
    gradcam_summary = (
        f"Grad-CAM++ map computed on {cam['layer']} for the '{label}' decision (class log-odds target). "
        f"The attribution is {focality}: {cam['hot_area_pct']}% of the image is above half of peak intensity, "
        f"with the strongest response in the {cam['peak_region']} part of the image (image coordinates). "
        + (f"{tissue_pct}% of the attribution lies within the head outline (brain, skull and soft tissue)." if tissue_pct is not None else "")
    )

    # 3) FSL biomarkers
    rep = report_mod.generate_report(file_bytes, filename, run_segmentation=run_segmentation)
    biomarkers = rep["biomarkers"]

    # 3.5) RAG: retrieve supporting literature to ground the rationale
    literature, lit_citations = _retrieve_literature(prediction, biomarkers, patient)

    # 4) Grounded LLM clinical rationale (prediction + biomarkers + retrieved literature)
    rationale, rationale_source = chatbot.generate_rationale(
        prediction, biomarkers, patient=patient,
        gradcam_summary=gradcam_summary, literature=literature,
        native_volume=rep.get("native_volume", False),
    )

    full_text = _structured_text(
        prediction, biomarkers, rep["report"], rationale, patient, rep["source"], lit_citations
    )

    return {
        "prediction": prediction,
        "gradcam": {
            "gradCamResult": cam["overlay"], "mriUrl": cam["original"], "heatmapUrl": cam["heatmap"],
            "layer": cam["layer"], "tissue_attribution_pct": tissue_pct,
        },
        "biomarkers": biomarkers,
        "biomarker_report": rep["report"],
        "biomarker_source": rep["source"],
        "native_volume": rep.get("native_volume", False),
        "rationale": rationale,
        "rationale_source": rationale_source,
        "literature": lit_citations,
        "report": full_text,
        "classifier_backend": inference.backend_name(),
    }
