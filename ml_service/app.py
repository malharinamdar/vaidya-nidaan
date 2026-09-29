"""Vaidya Nidaan ML / inference service (Flask).

Exposes the model, Grad-CAM++, biomarker-report, diagnosis and assistant pipelines over
HTTP for the React frontend. Every POST route is protected by ``security.protected``:
it verifies the Node gateway's JWT when ``JWT_SECRET`` is set, and rate-limits callers.
"""
import json
import os

from flask import Flask, request, jsonify
from flask_cors import CORS

import config  # loads .env first, so security sees JWT_SECRET
import cache
import security
import inference
import report as report_mod
import chatbot
import diagnosis as diagnosis_mod
import mri_check
from security import protected

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # reject oversized uploads with a clean 413

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES
# Comma-separated allow-list (e.g. "https://vaidya-nidaan.vercel.app"); "*" when unset (local dev).
_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
CORS(app, origins=_origins or "*")


@app.get("/")
@app.get("/health")
def health():
    return jsonify(
        status="ok",
        service="vaidya-nidaan-ml",
        classifier_backend=inference.backend_name(),
        classes=config.DEMENTIA_CLASSES,
        preprocess=config.MODEL_PREPROCESS,
        fsl_available=config.fsl_available(),
        openai_enabled=bool(config.OPENAI_API_KEY),
        auth_required=security.auth_enabled(),
        cache=cache.backend_name(),
    )


def _respond_cached(key, compute, cacheable=lambda value: True):
    """Serve ``key`` from the cache, or compute + store it. Adds an X-Cache header."""
    hit = cache.get(key)
    if hit is not None:
        resp = jsonify(hit)
        resp.headers["X-Cache"] = "HIT"
        return resp
    value = compute()
    if cacheable(value):
        cache.set(key, value)
    resp = jsonify(value)
    resp.headers["X-Cache"] = "MISS"
    return resp


def _require_mri():
    """Read the upload and validate it is a readable brain-MRI image.

    Returns (file_bytes, filename, err). ``err`` is a ready-to-return (response, status)
    tuple when the upload is missing, empty, or does not look like an MRI scan — so the
    model never runs on a colour photo, screenshot or other non-MRI input.
    """
    f = request.files.get("file") or request.files.get("mri") or request.files.get("image")
    if f is None:
        return None, None, (jsonify(message="No file uploaded (expected form field 'file')."), 400)
    data = f.read()
    if not data:
        return None, None, (jsonify(message="The uploaded file is empty."), 400)
    lower = (f.filename or "").lower()
    if lower.endswith(report_mod.VOLUMETRIC_EXTS):
        return data, f.filename, None  # NIfTI volumes are validated by nibabel downstream
    check = _check_image(data)
    if check["status"] == "not_mri":
        return None, None, (jsonify(message=check["message"], error="input_not_mri", check=check), 400)
    return data, f.filename, None


NOT_MRI_MESSAGE = "This doesn't look like a brain MRI scan. Upload an axial T1-weighted MRI slice (PNG or JPG)."


def _check_image(data):
    """Two-stage input check for 2D uploads.

    1. mri_check.is_mri -- cheap pixel heuristics (readable, greyscale, dark field, tissue present).
    2. inference.mri_likeness -- Mahalanobis distance of VGG-19 block4 features from the
       OASIS training slices; catches screenshots, documents and photos the heuristics miss.
    """
    ok, reason, metrics = mri_check.is_mri(data)
    if not ok:
        return {"status": "not_mri", "message": f"{NOT_MRI_MESSAGE} ({reason})", "stage": "pixels", "metrics": metrics}
    result = inference.mri_likeness(data)
    if result["status"] == "not_mri":
        result["message"] = NOT_MRI_MESSAGE
    elif result["status"] == "atypical":
        result["message"] = ("MRI-like image, but framed differently from the axial OASIS slices the model was "
                             "trained on (orientation, padding or plane).")
    else:
        result["message"] = "Brain MRI slice."
    result["stage"] = "features"
    return result


def _require_image(data, filename):
    """Classification / Grad-CAM need a 2D image, not a NIfTI volume."""
    if (filename or "").lower().endswith(report_mod.VOLUMETRIC_EXTS):
        return jsonify(message="Classification and Grad-CAM++ need a 2D MRI slice (PNG/JPG). "
                               "NIfTI volumes are supported by Biomarker analysis."), 400
    return None


@app.post("/validate")
@protected("analysis")
def validate():
    """Check an upload before analysis: {"status": "ok" | "atypical" | "not_mri", "message", ...}."""
    f = request.files.get("file")
    if f is None:
        return jsonify(message="No file uploaded (expected form field 'file')."), 400
    data = f.read()
    if (f.filename or "").lower().endswith(report_mod.VOLUMETRIC_EXTS):
        return jsonify(status="ok", message="NIfTI volume (used for biomarker analysis).", stage="volume")
    return _respond_cached(cache.make_key("validate", data), lambda: _check_image(data))


@app.post("/prediction")
@protected("analysis")
def prediction():
    data, filename, err = _require_mri()
    if err:
        return err
    err = _require_image(data, filename)
    if err:
        return err
    def compute():
        label, prob, per_class, message = inference.classify(data)
        return {"prediction": {"prediction": label, "alzheimer_probability": prob, "per_class": per_class,
                               "threshold": round(config.DECISION_THRESHOLD * 100, 1), "message": message}}

    return _respond_cached(cache.make_key("prediction", data), compute)


@app.post("/gradcam")
@app.post("/api/patients/<patient_id>/gradcam")
@protected("analysis")
def gradcam(patient_id=None):
    data, filename, err = _require_mri()
    if err:
        return err
    err = _require_image(data, filename)
    if err:
        return err
    def compute():
        cam = inference.grad_cam(data)
        return {"gradCamResult": cam["overlay"], "mriUrl": cam["original"], "heatmapUrl": cam["heatmap"],
                "layer": cam["layer"], "tissue_attribution_pct": cam["tissue_attribution_pct"]}

    return _respond_cached(cache.make_key("gradcam", data), compute)


@app.post("/report")
@app.post("/api/patients/<patient_id>/report")
@protected("analysis")
def biomarker_report(patient_id=None):
    data, filename, err = _require_mri()
    if err:
        return err
    # FSL FAST tissue segmentation runs by default; set segmentation=0 to skip it.
    run_seg = request.args.get("segmentation", "1") not in ("0", "false", "no")
    return _respond_cached(
        cache.make_key("report", data, (filename or "").lower().rsplit(".", 1)[-1], run_seg),
        lambda: report_mod.generate_report(data, filename, run_segmentation=run_seg),
        cacheable=lambda r: r.get("source", "").startswith("FSL"),  # don't pin an FSL failure
    )


def _parse_json_field(name):
    raw = request.form.get(name)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


@app.post("/diagnosis")
@app.post("/api/patients/<patient_id>/diagnosis")
@protected("diagnosis")
def full_diagnosis(patient_id=None):
    """Combined report: prediction + Grad-CAM++ + FSL biomarkers + RAG-grounded LLM rationale."""
    data, filename, err = _require_mri()
    if err:
        return err
    err = _require_image(data, filename)
    if err:
        return err
    run_seg = request.args.get("segmentation", "1") not in ("0", "false", "no")
    patient = _parse_json_field("patient")
    return _respond_cached(
        cache.make_key("diagnosis", data, patient, run_seg, config.OPENAI_MODEL),
        lambda: diagnosis_mod.run_diagnosis(data, filename, patient=patient, run_segmentation=run_seg),
        cacheable=lambda r: r.get("rationale_source") == "llm",  # never pin an offline fallback
    )


def _chat_response():
    text = (request.form.get("text", "") or request.form.get("message", "")).strip()
    image_bytes, image_mime = None, "image/png"
    f = request.files.get("file")
    if f is not None:
        if not (f.mimetype or "").startswith("image/"):
            return jsonify(message="The assistant accepts image attachments only (PNG/JPG)."), 400
        image_bytes = f.read()
        image_mime = f.mimetype or "image/png"
    if not text and image_bytes is None:
        return jsonify(message="Type a question or attach an image."), 400
    history = _parse_json_field("history")
    history = history if isinstance(history, list) else None
    context = request.form.get("context") or None

    def compute():
        reply = chatbot.answer(text, image_bytes=image_bytes, image_mime=image_mime, history=history, context=context)
        return {"message": reply["message"], "sources": reply["sources"], "offline": reply.get("offline", False),
                "citation_check": reply.get("citation_check")}

    key = cache.make_key("chat", config.OPENAI_MODEL, text, context, history, image_bytes or b"")
    return _respond_cached(key, compute, cacheable=lambda r: not r["offline"])


@app.post("/chat")
@app.post("/api/query1")  # legacy aliases
@app.post("/api/query2")
@protected("chat")
def chat():
    return _chat_response()


@app.errorhandler(413)
def _too_large(_e):
    return jsonify(message=f"File too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)."), 413


@app.errorhandler(Exception)
def _unhandled(e):
    """Return clean JSON for any uncaught error instead of an HTML traceback."""
    from werkzeug.exceptions import HTTPException

    if isinstance(e, HTTPException):
        return jsonify(message=e.description), e.code
    print(f"[ml_service] unhandled error: {e!r}")
    return jsonify(message="The analysis failed on the server. Please try again."), 500


if __name__ == "__main__":
    print(f"[ml_service] classifier backend: {inference.backend_name()}")
    print(f"[ml_service] FSL available: {config.fsl_available()} ({config.FSLDIR})")
    print(f"[ml_service] OpenAI chatbot: {'enabled' if config.OPENAI_API_KEY else 'offline fallback'}")
    print(f"[ml_service] JWT auth: {'ON' if security.auth_enabled() else 'OFF (set JWT_SECRET)'}")
    app.run(host="0.0.0.0", port=config.PORT, debug=False)
