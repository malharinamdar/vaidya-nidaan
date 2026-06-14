"""Multilingual medical assistant chatbot.

Uses OpenAI GPT-4o (vision-capable, mirrors ``research/notebooks/chatbot_rag.ipynb``) when
``OPENAI_API_KEY`` is configured. Otherwise an offline, rule-based assistant
answers locally so the chat feature works without any external service or key.
"""
import base64

from config import OPENAI_API_KEY, OPENAI_MODEL

SYSTEM_PROMPT = (
    "You are Vaidya Nidaan, a multilingual medical-imaging assistant that supports a "
    "QUALIFIED DOCTOR (not a layperson) reviewing brain MRI scans for Alzheimer's. "
    "When the user attaches an MRI image, DO NOT refuse — describe what is visible in an "
    "observational, educational way: anatomical regions (ventricles, hippocampus/medial "
    "temporal lobe, cortical surface), left/right symmetry, sulcal widening, and intensity "
    "patterns, and note features that are commonly relevant to atrophy or dementia. Make "
    "clear you are providing assistive observations, not a final diagnosis, and that a "
    "radiologist/neurologist confirms findings. Reply in the same language the user writes "
    "in (English, Hindi, Marathi or any regional Indian language). Be clear and concise."
)

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not OPENAI_API_KEY:
        return None
    try:
        from openai import OpenAI

        _client = OpenAI(api_key=OPENAI_API_KEY)
        return _client
    except Exception as exc:  # pragma: no cover - optional dep
        print(f"[chatbot] OpenAI client unavailable ({exc}); using offline assistant.")
        return None


def _offline_answer(text, has_image):
    text_l = (text or "").strip().lower()
    if not text_l and has_image:
        return (
            "I can see you've attached an MRI image. I can describe general MRI "
            "characteristics, but for a reliable reading please use the Alzheimer's "
            "Detection and Grad-CAM tools, and confirm findings with a radiologist."
        )
    knowledge = {
        ("mri", "scan"): (
            "An MRI (Magnetic Resonance Imaging) scan uses strong magnetic fields and "
            "radio waves to produce detailed images of the brain. In Alzheimer's work-ups "
            "it helps assess hippocampal volume, cortical thinning and ventricular enlargement."
        ),
        ("alzheimer", "dementia"): (
            "Alzheimer's disease is a progressive neurodegenerative disorder. On MRI it is "
            "often associated with medial-temporal-lobe (hippocampal) atrophy and enlarged "
            "ventricles. Diagnosis combines imaging, cognitive testing and clinical history."
        ),
        ("hippocamp",): (
            "The hippocampus is central to memory formation and is one of the earliest "
            "regions affected in Alzheimer's; reduced hippocampal volume is a key biomarker."
        ),
        ("grad-cam", "gradcam", "heatmap"): (
            "Grad-CAM++ produces a heatmap highlighting the image regions that most influenced "
            "the model's prediction, making the AI's reasoning more transparent."
        ),
        ("biomarker", "volume", "report"): (
            "Biomarker analysis here measures tissue volumes and intensity statistics "
            "(e.g. grey/white matter and CSF) from the scan to support interpretation."
        ),
    }
    for keys, answer in knowledge.items():
        if any(k in text_l for k in keys):
            return answer + "\n\n(Offline assistant — set OPENAI_API_KEY for the full GPT-4 chatbot.)"
    return (
        "I'm the Vaidya Nidaan assistant. I can explain MRI scans, Alzheimer's disease, "
        "hippocampal atrophy, Grad-CAM heatmaps and the biomarker report. Ask me about any "
        "of these.\n\n(Offline assistant — set OPENAI_API_KEY to enable the full GPT-4-turbo "
        "multilingual chatbot.)"
    )


RATIONALE_SYSTEM = (
    "You are a clinical decision-support assistant for neurologists. You are given the "
    "output of a VGG-19 Alzheimer's MRI classifier, a Grad-CAM++ explainability summary, "
    "and FSL-derived brain biomarkers. Write a concise, structured clinical rationale that "
    "interprets these findings together. Reference the specific probabilities and biomarker "
    "values. Comment on whether the biomarkers (grey-matter fraction, GM:WM ratio, CSF "
    "fraction, brain volume) are consistent or inconsistent with the model's prediction, and "
    "what they suggest about cortical atrophy. Use clear headings. Be objective, do not "
    "overstate certainty, and end with an explicit reminder that this is decision support, "
    "not a diagnosis, and must be confirmed by a qualified clinician."
)


def _fmt_dict(d):
    return "\n".join(f"  - {k.replace('_',' ')}: {v}" for k, v in (d or {}).items())


def generate_rationale(prediction, biomarkers, patient=None, gradcam_summary=None):
    """Generate an LLM clinical rationale from the prediction + biomarkers context."""
    per_class = prediction.get("per_class", {})
    context = f"""MODEL PREDICTION (VGG-19 classifier):
  - Predicted class: {prediction.get('prediction')}
  - Probability of dementia (1 - P[Non Demented]): {prediction.get('alzheimer_probability')}%
  - Per-class probabilities:
{_fmt_dict(per_class)}

GRAD-CAM++ EXPLAINABILITY:
  {gradcam_summary or 'Heatmap generated over the last VGG-19 conv block (block5_conv4) highlighting the regions that most influenced the prediction.'}

FSL BIOMARKERS:
{_fmt_dict(biomarkers)}
"""
    if patient:
        context += "\nPATIENT CONTEXT:\n" + _fmt_dict(patient)

    client = _get_client()
    if client is None:
        return _offline_rationale(prediction, biomarkers, context)

    try:
        resp = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": RATIONALE_SYSTEM},
                {"role": "user", "content": context},
            ],
            temperature=0.3,
        )
        return resp.choices[0].message.content
    except Exception as exc:  # pragma: no cover
        return f"(LLM rationale failed: {exc})\n\n" + _offline_rationale(prediction, biomarkers, context)


def _offline_rationale(prediction, biomarkers, context):
    gm = biomarkers.get("grey_matter_fraction_pct")
    csf = biomarkers.get("csf_fraction_pct")
    ratio = biomarkers.get("gm_wm_ratio")
    bits = [
        "Clinical Rationale (offline summary — set OPENAI_API_KEY for the full LLM version):",
        f"- The classifier predicts '{prediction.get('prediction')}' with a dementia probability "
        f"of {prediction.get('alzheimer_probability')}%.",
    ]
    if gm is not None:
        bits.append(
            f"- Grey-matter fraction is {gm}% and GM:WM ratio is {ratio}. Lower grey-matter "
            f"fraction / GM:WM ratio with a raised CSF fraction ({csf}%) would be consistent "
            "with cortical atrophy supporting a dementia prediction."
        )
    bits.append("- This is decision support only and must be confirmed by a qualified clinician.")
    return "\n".join(bits)


def answer(text, image_bytes=None, image_mime="image/png"):
    """Return an assistant reply string for the given text (+ optional image)."""
    client = _get_client()
    if client is None:
        return _offline_answer(text, image_bytes is not None)

    try:
        content = [{"type": "text", "text": text or "Describe this MRI scan."}]
        if image_bytes is not None:
            b64 = base64.b64encode(image_bytes).decode("utf-8")
            content.append(
                {"type": "image_url", "image_url": {"url": f"data:{image_mime};base64,{b64}"}}
            )
        resp = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": content},
            ],
        )
        return resp.choices[0].message.content
    except Exception as exc:  # pragma: no cover - network/credentials
        return f"(GPT-4 request failed: {exc})\n\n" + _offline_answer(text, image_bytes is not None)
