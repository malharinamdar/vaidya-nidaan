"""Vaidya Nidaan ML / inference service (Flask).

Exposes the model, Grad-CAM, biomarker-report and chatbot pipelines over HTTP so
the React frontend and Node backend can use them. Response shapes intentionally
match what the existing frontend pages expect.
"""
from flask import Flask, request, jsonify
from flask_cors import CORS

import json

import config
import inference
import report as report_mod
import chatbot
import diagnosis as diagnosis_mod
import mri_check

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # reject oversized uploads with a clean 413

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES
CORS(app)  # allow the Vite dev server (any origin) to call us


@app.get("/health")
def health():
    return jsonify(
        status="ok",
        service="vaidya-nidaan-ml",
        classifier_backend=inference.backend_name(),
        fsl_available=config.fsl_available(),
        fsldir=config.FSLDIR,
        openai_enabled=bool(config.OPENAI_API_KEY),
    )


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
    ok, reason, metrics = mri_check.is_mri(data)
    if not ok:
        return None, None, (jsonify(message=reason, error="input_not_mri", metrics=metrics), 400)
    return data, f.filename, None


@app.post("/prediction")
def prediction():
    data, _filename, err = _require_mri()
    if err:
        return err
    label, prob, per_class, message = inference.classify(data)
    # AlzheimerDetection.jsx reads data.prediction.{prediction,alzheimer_probability,message}
    return jsonify(
        prediction={
            "prediction": label,
            "alzheimer_probability": prob,
            "per_class": per_class,
            "message": message,
        }
    )


@app.post("/gradcam")
@app.post("/api/patients/<patient_id>/gradcam")
def gradcam(patient_id=None):
    data, _filename, err = _require_mri()
    if err:
        return err
    overlay_url, mri_url = inference.grad_cam(data)
    # GRAD-CAM.jsx reads result.gradCamResult and result.mriUrl
    return jsonify(gradCamResult=overlay_url, mriUrl=mri_url, patientId=patient_id)


@app.post("/report")
@app.post("/api/patients/<patient_id>/report")
def biomarker_report(patient_id=None):
    data, filename, err = _require_mri()
    if err:
        return err
    # FSL FAST tissue segmentation runs by default; set segmentation=0 to skip it.
    run_seg = request.args.get("segmentation", "1") not in ("0", "false", "no")
    result = report_mod.generate_report(data, filename, run_segmentation=run_seg)
    result["patientId"] = patient_id
    return jsonify(result)


def _parse_patient():
    """Optional patient context passed as a JSON form field."""
    raw = request.form.get("patient")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


@app.post("/diagnosis")
@app.post("/api/patients/<patient_id>/diagnosis")
def full_diagnosis(patient_id=None):
    """Combined report: prediction + Grad-CAM++ + FSL biomarkers + LLM rationale."""
    data, filename, err = _require_mri()
    if err:
        return err
    run_seg = request.args.get("segmentation", "1") not in ("0", "false", "no")
    result = diagnosis_mod.run_diagnosis(
        data, filename, patient=_parse_patient(), run_segmentation=run_seg
    )
    result["patientId"] = patient_id
    return jsonify(result)


def _chat_response():
    text = request.form.get("text", "") or request.form.get("message", "")
    image_bytes = None
    image_mime = "image/png"
    f = request.files.get("file")
    if f is not None:
        image_bytes = f.read()
        image_mime = f.mimetype or "image/png"
    reply = chatbot.answer(text, image_bytes=image_bytes, image_mime=image_mime)
    # Chatbot.jsx reads response.data.message
    return jsonify(message=reply)


@app.post("/api/query1")  # first query (may include an image)
def query1():
    return _chat_response()


@app.post("/api/query2")  # follow-up (text only)
def query2():
    return _chat_response()


@app.post("/chat")  # generic alias
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
    print(f"[ml_service] unhandled error: {e}")
    return jsonify(message=f"Internal error: {e}"), 500


if __name__ == "__main__":
    print(f"[ml_service] classifier backend: {inference.backend_name()}")
    print(f"[ml_service] FSL available: {config.fsl_available()} ({config.FSLDIR})")
    print(f"[ml_service] OpenAI chatbot: {'enabled' if config.OPENAI_API_KEY else 'offline fallback'}")
    app.run(host="0.0.0.0", port=config.PORT, debug=False)
