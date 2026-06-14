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

app = Flask(__name__)
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


def _require_file():
    f = request.files.get("file") or request.files.get("mri") or request.files.get("image")
    if f is None:
        return None, (jsonify(message="No file uploaded (expected form field 'file')."), 400)
    return f, None


@app.post("/prediction")
def prediction():
    f, err = _require_file()
    if err:
        return err
    label, prob, per_class, message = inference.classify(f.read())
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
    f, err = _require_file()
    if err:
        return err
    overlay_url, mri_url = inference.grad_cam(f.read())
    # GRAD-CAM.jsx reads result.gradCamResult and result.mriUrl
    return jsonify(gradCamResult=overlay_url, mriUrl=mri_url, patientId=patient_id)


@app.post("/report")
@app.post("/api/patients/<patient_id>/report")
def biomarker_report(patient_id=None):
    f, err = _require_file()
    if err:
        return err
    # FSL FAST tissue segmentation runs by default; set segmentation=0 to skip it.
    run_seg = request.args.get("segmentation", "1") not in ("0", "false", "no")
    result = report_mod.generate_report(f.read(), f.filename, run_segmentation=run_seg)
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
    f, err = _require_file()
    if err:
        return err
    run_seg = request.args.get("segmentation", "1") not in ("0", "false", "no")
    result = diagnosis_mod.run_diagnosis(
        f.read(), f.filename, patient=_parse_patient(), run_segmentation=run_seg
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


if __name__ == "__main__":
    print(f"[ml_service] classifier backend: {inference.backend_name()}")
    print(f"[ml_service] FSL available: {config.fsl_available()} ({config.FSLDIR})")
    print(f"[ml_service] OpenAI chatbot: {'enabled' if config.OPENAI_API_KEY else 'offline fallback'}")
    app.run(host="0.0.0.0", port=config.PORT, debug=False)
