"""Multilingual medical assistant chatbot.

Uses OpenAI GPT-4o (vision-capable) when ``OPENAI_API_KEY`` is configured, with the
conversation history and -- for text questions -- PubMed abstracts retrieved from the
same Chroma store as the report (``medical_rag.py``), cited as [n]. Otherwise an
offline, rule-based assistant answers locally so the chat works without any key.
"""
import base64
import json
import os
import re

from config import MODEL_EVAL_SUMMARY, OPENAI_API_KEY, OPENAI_MODEL

VERIFIER_MODEL = os.environ.get("OPENAI_VERIFIER_MODEL", "gpt-4o-mini")

SYSTEM_PROMPT = (
    "You are Vaidya Nidaan, a medical-imaging assistant that supports a QUALIFIED DOCTOR (not a layperson) "
    "reviewing brain MRI scans for Alzheimer's disease.\n"
    "Scope: help only with medicine and healthcare -- neurology, dementia, neuroimaging, other clinical topics, "
    "patient care, medical research, and how this app's analyses work (the VGG-19 classifier, Grad-CAM++, FSL "
    "biomarkers, reports). For anything else (sports, politics, current affairs, entertainment, coding, general "
    "trivia) do not answer; say in one or two sentences that you can only help with healthcare and medical-imaging "
    "questions, and suggest a relevant question.\n"
    "Images: when the user attaches a medical image (MRI, CT, X-ray, lab report, clinical photo), DO NOT refuse -- "
    "describe what is visible in an observational, educational way: anatomical regions (ventricles, hippocampus/"
    "medial temporal lobe, cortical surface), left/right symmetry, sulcal widening, intensity patterns, and features "
    "commonly relevant to atrophy or dementia. If the image is not medical (a chat or app screenshot, a document "
    "unrelated to health, an everyday photo), say it isn't a medical image and that you can only analyse medical "
    "images -- do not describe its contents.\n"
    "Present observations as assistive, not a final diagnosis. Be clear and concise.\n"
    "Language: reply in the language of the user's LATEST message (a system note names it). Never switch language "
    "because of the patient context, earlier turns or the literature."
)

# Screening pass before the main model: which language to reply in, and whether the turn is in scope.
SCREEN_SYSTEM = (
    "You screen messages sent to a medical assistant used by doctors who review brain MRI for Alzheimer's disease. "
    'Return JSON only: {"language": "...", "in_scope": true|false, "reason": "image"|"topic"|"", "refusal": "...", '
    '"search_query": "..."}.\n'
    "language: the language of the LATEST user message only (ignore earlier turns). Plain English text, however short "
    "or informal, is English. Hindi or Marathi typed in LATIN letters (e.g. 'ye kya hai') is 'romanized Hindi' or "
    "'romanized Marathi'; text in Devanagari or another Indian script is NOT romanized -- name the language (Hindi, "
    "Marathi, Tamil ...). If the latest message has no text, use the language of the previous user message, else English.\n"
    "in_scope = true for: medicine, healthcare, clinical care, neurology, dementia, neuroimaging, medical images, "
    "biomarkers, medical research, questions about this app or its analyses (classifier, Grad-CAM, FSL, reports, "
    "accuracy), follow-ups that continue an in-scope conversation, and greetings or thanks.\n"
    "in_scope = false for: sports, politics, current affairs, entertainment, general knowledge, coding, homework, "
    "and attached images that are not medical (chat or app screenshots, unrelated documents, everyday photos).\n"
    "reason: 'image' when the attached image is not medical, 'topic' when the question is off-topic, else ''.\n"
    "refusal: only when in_scope is false -- one or two friendly sentences, written in the detected language, saying "
    "you can only help with healthcare and medical-imaging questions and suggesting one relevant thing to ask. If the "
    "reason is a non-medical image, say that the image doesn't look like a medical image. "
    'Otherwise "".\n'
    "search_query: when in scope, a short ENGLISH search query (5-15 words) for finding PubMed abstracts that answer "
    "the latest message -- translate it if it is not in English, and resolve references to earlier turns (e.g. 'and "
    "its treatment?' after a question about Alzheimer's becomes 'Alzheimer disease treatment options'). Use \"\" for "
    "greetings, thanks, or questions about a specific attached image."
)
IMAGE_REFUSAL = (
    "This doesn't look like a medical image. I can analyse brain MRI slices and other medical images, and answer "
    "healthcare questions. Attach a scan or ask about MRI findings."
)
DEFAULT_REFUSAL = (
    "I can only help with healthcare and medical-imaging questions, such as MRI findings, dementia, biomarkers or "
    "this patient's results. Try asking about one of those."
)

# Unicode blocks of Indian (and a few other) scripts, used when the screening call is unavailable.
_SCRIPTS = [
    ((0x0900, 0x097F), "Hindi or Marathi (reply in the same one, in Devanagari script)"),
    ((0x0980, 0x09FF), "Bengali"), ((0x0A00, 0x0A7F), "Punjabi"), ((0x0A80, 0x0AFF), "Gujarati"),
    ((0x0B00, 0x0B7F), "Odia"), ((0x0B80, 0x0BFF), "Tamil"), ((0x0C00, 0x0C7F), "Telugu"),
    ((0x0C80, 0x0CFF), "Kannada"), ((0x0D00, 0x0D7F), "Malayalam"), ((0x0600, 0x06FF), "Urdu"),
]


def _script_language(text):
    counts = {}
    for ch in text or "":
        cp = ord(ch)
        for (lo, hi), name in _SCRIPTS:
            if lo <= cp <= hi:
                counts[name] = counts.get(name, 0) + 1
    return max(counts, key=counts.get) if counts else "English"


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
    "You are an experienced neuroradiology decision-support assistant writing for a neurologist. You receive a "
    "VGG-19 Alzheimer's MRI classifier output, a Grad-CAM++ summary, FSL tissue biomarkers for the uploaded scan, "
    "the patient's details and clinical notes, and numbered PubMed/MEDLINE abstracts. Write an elaborate, clinically "
    "useful rationale (roughly 400-550 words) that INTERPRETS the findings -- do not just restate the numbers.\n\n"
    "Format: plain text, no Markdown symbols (no asterisks, underscores or #). Put each heading on its own line, "
    "then short paragraphs or '- ' bullet points. Use exactly these headings:\n"
    "Clinical impression -- 2-3 sentences integrating everything into one overall picture and how much weight it deserves.\n"
    "Classifier interpretation -- what the probability and its margin from the decision threshold given in the input "
    "mean, and how much it should move the clinician's estimate given the reported test sensitivity/specificity and "
    "that it scores a single slice.\n"
    "Explainability -- interpret the Grad-CAM++ pattern (focal vs diffuse, share within the head, peak location in "
    "image coordinates); explain what a clinically meaningful attribution would look like (medial temporal lobes, "
    "hippocampi, ventricles, cortical sulci) and what the clinician should check when viewing the overlay.\n"
    "Tissue biomarkers -- interpret the CSF, grey-matter and white-matter fractions, GM:WM ratio and parenchymal "
    "fraction against typical Alzheimer's atrophy patterns (grey-matter loss, CSF and ventricular expansion); state "
    "whether they agree or disagree with the classifier, and what would strengthen the measurement.\n"
    "Risk profile -- relate age, sex, smoking, alcohol, neurological history and any clinical notes (e.g. MMSE/MoCA "
    "scores, symptoms) to the findings.\n"
    "Evidence from the literature -- synthesise what the retrieved abstracts actually report that is relevant here "
    "(specific findings, markers, effect directions), citing each claim with [n].\n"
    "Differential considerations -- as bullets: Alzheimer's disease vs normal ageing, vascular cognitive impairment, "
    "frontotemporal dementia, Lewy body dementia, normal-pressure hydrocephalus or others as relevant, each with "
    "what in this case supports or argues against it.\n"
    "Recommended next steps -- as bullets: specific, actionable work-up (cognitive testing such as MoCA/MMSE/ACE-III, "
    "reversible-cause labs such as B12, folate and TSH, dedicated 3D T1 MRI with coronal hippocampal views and MTA "
    "rating, FLAIR for white-matter disease, amyloid/tau PET or CSF biomarkers where appropriate, follow-up interval).\n\n"
    "Accuracy rules (follow silently, without adding disclaimers):\n"
    "- Refer to the model's decision as a classification or pattern; do not state the patient has dementia.\n"
    "- You only receive a text summary of the heatmap, never the image: do not claim it lies on a named brain structure, "
    "and note that the head outline also contains skull, scalp and orbits, so a share 'within the head' does not show "
    "the evidence is in brain tissue.\n"
    "- Only describe something as absent (e.g. no ventricular enlargement, no white-matter disease) if the provided data "
    "actually measure it; otherwise say it has not been assessed. Do not call single-slice fractions 'normal' -- there "
    "are no reference ranges for them; compare them directionally.\n"
    "- For a 2D upload the tissue values describe the imaged slice, which depends on slice level; interpret "
    "them directionally rather than as whole-brain volumes.\n"
    "- Cite only the numbered abstracts provided and never invent studies or numbers; general clinical knowledge "
    "(e.g. standard work-up, typical atrophy patterns) may be used without citation."
)


def _fmt_dict(d):
    return "\n".join(f"  - {k.replace('_',' ')}: {v}" for k, v in (d or {}).items())


def _strip_markdown(text):
    """Remove Markdown emphasis/heading markers so the plain-text report has no stray ** or #."""
    if not text:
        return text
    text = text.replace("**", "").replace("__", "")
    return "\n".join(re.sub(r"^\s{0,3}#{1,6}\s+", "", ln) for ln in text.split("\n"))


# --- Citation verification ---------------------------------------------------------------
# A second, cheap model checks every sentence that cites a retrieved paper against that
# paper's abstract; citations the abstract does not support are removed from the text.
_CITE_GROUP = re.compile(r"\[(\d+(?:\s*[,\u2013-]\s*\d+)*)\]")
VERIFY_SYSTEM = (
    "You check citations. For each claim, decide for every cited source number whether that source's abstract "
    "supports the claim -- i.e. states it or clearly implies it. Background clinical knowledge does not count; "
    "only the abstract. Claims may be written in another language (e.g. Hindi, Marathi); judge their meaning against "
    "the English abstract, not the wording. Reply with JSON: {\"results\": [{\"id\": <claim id>, \"unsupported\": [<source numbers>]}]}."
)


def _expand(group):
    nums = []
    for part in re.split(r"\s*,\s*", group):
        if re.fullmatch(r"\d+\s*[\u2013-]\s*\d+", part):
            a, b = (int(x) for x in re.split(r"\s*[\u2013-]\s*", part))
            nums += list(range(a, b + 1))
        elif part.strip().isdigit():
            nums.append(int(part))
    return nums


def verify_citations(text, abstracts):
    """Drop citations the cited abstract does not support.

    ``abstracts``: list of (title, abstract) for sources [1..n]. Returns (text, stats) where
    stats = {"checked": citations checked, "supported": kept, "removed": dropped}. Fails open.
    """
    client = _get_client()
    claims = []
    for line in (text or "").split("\n"):
        for sent in re.split(r"(?<=[.!?])\s+", line):
            if _CITE_GROUP.search(sent):
                claims.append(sent)
    if client is None or not claims or not abstracts:
        return text, {"checked": 0, "supported": 0, "removed": 0}
    sources = "\n\n".join(f"[{i + 1}] {t}\n{a[:1500]}" for i, (t, a) in enumerate(abstracts))
    items = "\n".join(f"{i}. {c}" for i, c in enumerate(claims))
    try:
        resp = client.chat.completions.create(
            model=VERIFIER_MODEL,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[{"role": "system", "content": VERIFY_SYSTEM},
                      {"role": "user", "content": f"SOURCES:\n{sources}\n\nCLAIMS:\n{items}"}],
        )
        results = json.loads(resp.choices[0].message.content).get("results", [])
    except Exception as exc:
        print(f"[chatbot] citation check unavailable ({exc})")
        return text, {"checked": 0, "supported": 0, "removed": 0}

    bad = {int(r.get("id", -1)): {int(n) for n in r.get("unsupported", []) if str(n).isdigit()} for r in results}
    checked = removed = 0
    for i, claim in enumerate(claims):
        def fix(m, drop=bad.get(i, set())):
            nonlocal checked, removed
            nums = _expand(m.group(1))
            keep = [n for n in nums if n not in drop and 1 <= n <= len(abstracts)]
            checked += len(nums)
            removed += len(nums) - len(keep)
            return f"[{', '.join(map(str, keep))}]" if keep else ""
        fixed = _CITE_GROUP.sub(fix, claim)
        fixed = re.sub(r"\s+([.,;:])", r"\1", fixed).replace("  ", " ")
        text = text.replace(claim, fixed, 1)
    return text, {"checked": checked, "supported": checked - removed, "removed": removed}


def generate_rationale(prediction, biomarkers, patient=None, gradcam_summary=None, literature=None,
                       native_volume=False):
    """Generate an LLM clinical rationale from the prediction + biomarkers (+ retrieved literature).

    Returns ``(text, source)`` where source is "llm" or "offline" (fallback summary).

    ``literature`` is an optional pre-formatted, numbered block of paper excerpts from the RAG
    retriever; when present the model may point to it as related reading (reference material for the
    clinician, NOT proof of the patient-specific findings).
    """
    per_class = prediction.get("per_class", {})
    context = f"""MODEL PREDICTION (VGG-19 classifier):
  - Predicted class: {prediction.get('prediction')}
  - Probability of dementia (1 - P[Non Demented]): {prediction.get('alzheimer_probability')}%
  - Decision threshold: Demented when P(Demented) >= {prediction.get('threshold', 50)}% (tuned on validation patients; P(Demented) is a model score, not a calibrated probability of disease)
  - Per-class probabilities:
{_fmt_dict(per_class)}
  - Test performance: {MODEL_EVAL_SUMMARY}

GRAD-CAM++ EXPLAINABILITY:
  {gradcam_summary or 'Heatmap generated over the last VGG-19 conv block (block5_conv4) highlighting the regions that most influenced the prediction.'}

FSL BIOMARKERS
  MEASUREMENT: {"volumetric (native 3D scan)" if native_volume else "tissue composition of one 2D slice"}
{_fmt_dict(biomarkers)}
"""
    if patient:
        context += "\nPATIENT CONTEXT:\n" + _fmt_dict(patient)
    if literature:
        context += ("\nRELATED LITERATURE (topically-related reference reading only — you MAY point "
                    "to it as related reading, but do NOT cite it as proof of the findings):\n" + literature)

    client = _get_client()
    if client is None:
        return _offline_rationale(prediction, biomarkers, context), "offline"

    try:
        resp = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": RATIONALE_SYSTEM},
                {"role": "user", "content": context},
            ],
            temperature=0.2,  # near-deterministic, but allows a natural clinical narrative
            max_tokens=1200,
        )
        return _strip_markdown(resp.choices[0].message.content), "llm"
    except Exception as exc:  # network / quota / rate-limit -> clean offline fallback (no raw error in UI)
        print(f"[chatbot] rationale LLM unavailable ({exc}); using offline summary.")
        return _offline_rationale(prediction, biomarkers, context), "offline"


def _offline_rationale(prediction, biomarkers, context):
    gm = biomarkers.get("grey_matter_fraction_pct")
    csf = biomarkers.get("csf_fraction_pct")
    ratio = biomarkers.get("gm_wm_ratio")
    bits = [
        "Summary",
        f"- The classifier predicts '{prediction.get('prediction')}' with a dementia probability "
        f"of {prediction.get('alzheimer_probability')}%.",
    ]
    if gm is not None:
        bits.append(
            f"- Grey-matter fraction is {gm}% and GM:WM ratio is {ratio}. Lower grey-matter "
            f"fraction / GM:WM ratio with a raised CSF fraction ({csf}%) would be consistent "
            "with cortical atrophy supporting a dementia prediction."
        )
    bits.append("- Recommendation: correlate with cognitive testing and clinical review.")
    return "\n".join(bits)


CHAT_RAG_NOTE = (
    "LITERATURE: numbered PubMed/MEDLINE abstracts retrieved for the doctor's question are "
    "provided below. When a statement is supported by them, cite it inline as [n]. If they do not "
    "cover the question, answer from general medical knowledge and do not invent citations. "
    "Never cite a number that is not in the list."
)
MAX_HISTORY_TURNS = 10


def _retrieve_for_chat(question):
    """RAG for the assistant: PubMed abstracts for the question, or [] if nothing relevant.

    ``question`` is the English search query written by the screening step (the embedder is an
    English model). Uses the same chunked Chroma store, distance floor and cross-encoder rerank as
    medical_rag.py; if nothing is close enough the assistant answers without literature (it never
    cites what it didn't retrieve).
    """
    if not question or len(question.strip()) < 8:
        return []
    try:
        import medical_rag

        hits = medical_rag.retrieve(question, k=4)
    except Exception as exc:  # store missing / import error -> answer without literature
        print(f"[chatbot] retrieval unavailable ({exc})")
        return []
    return [h for h in hits if h["distance"] <= medical_rag.MAX_DISTANCE]


def _history_messages(history):
    msgs = []
    for turn in (history or [])[-MAX_HISTORY_TURNS:]:
        role = turn.get("role")
        content = (turn.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            msgs.append({"role": role, "content": content[:4000]})
    return msgs


def _screen(client, text, image_bytes, image_mime, history):
    """Detect the reply language and whether this turn is in scope (healthcare / medical imaging).

    Uses the small verifier model with JSON output; the last few turns are included so follow-ups
    ("and its side effects?") are judged in context. Fails open (in scope, script-based language).
    """
    fallback = {"language": _script_language(text), "in_scope": True, "refusal": "", "search_query": text}
    recent = [f"{t.get('role')}: {(t.get('content') or '')[:300]}" for t in (history or [])[-4:] if t.get("content")]
    prompt = ("Earlier turns:\n" + "\n".join(recent) + "\n\n" if recent else "") + \
             f"LATEST user message: {text or '(no text, only an image)'}" + \
             ("\n(An image is attached; judge whether it is a medical image.)" if image_bytes is not None else "")
    content = [{"type": "text", "text": prompt}]
    if image_bytes is not None:
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        content.append({"type": "image_url", "image_url": {"url": f"data:{image_mime};base64,{b64}", "detail": "low"}})
    try:
        resp = client.chat.completions.create(
            model=VERIFIER_MODEL,
            messages=[{"role": "system", "content": SCREEN_SYSTEM}, {"role": "user", "content": content}],
            response_format={"type": "json_object"},
            temperature=0,
            max_tokens=260,
            timeout=15,
        )
        data = json.loads(resp.choices[0].message.content or "{}")
    except Exception as exc:
        print(f"[chatbot] screening unavailable ({exc}); answering without it.")
        return fallback
    language = str(data.get("language") or "").strip() or fallback["language"]
    # The script is checked in code: text typed in an Indian script is never "romanized".
    if _script_language(text) != "English" and "romanized" in language.lower():
        base = re.sub(r"(?i)romanized", "", language).strip() or "the user's language"
        language = f"{base}, written in its native script"
    in_scope = data.get("in_scope") is not False
    refusal = str(data.get("refusal") or "").strip()
    if not in_scope and data.get("reason") == "image" and language.lower().startswith("english"):
        refusal = IMAGE_REFUSAL
    return {"language": language, "in_scope": in_scope, "refusal": refusal,
            "search_query": str(data.get("search_query") or "").strip()}


def answer(text, image_bytes=None, image_mime="image/png", history=None, context=None):
    """Assistant reply for ``text`` (+ optional image), given earlier ``history`` turns.

    ``history``: [{"role": "user"|"assistant", "content": str}, ...] (text only).
    ``context``: optional plain-text patient/findings summary from the workspace.
    Returns {"message": str, "sources": [{n, title, year, url}]} -- sources are only the
    retrieved papers the reply actually cites.
    """
    client = _get_client()
    if client is None:
        return {"message": _offline_answer(text, image_bytes is not None), "sources": [], "offline": True}

    screen = _screen(client, text, image_bytes, image_mime, history)
    if not screen["in_scope"]:
        return {"message": screen["refusal"] or DEFAULT_REFUSAL, "sources": [],
                "citation_check": {"checked": 0, "supported": 0, "removed": 0}, "in_scope": False}

    # Retrieval runs on the screening step's English search query: the embedder only understands
    # English, and follow-ups ("and its treatment?") need the earlier turns resolved. Vague questions
    # ("summarise this patient") are also anchored to the patient's current findings.
    query = screen.get("search_query") or ""
    if context:
        findings = [ln for ln in context.splitlines() if ln.startswith(("Current scan", "Latest saved report"))]
        if findings:
            query = f"{query or text}\n{' '.join(findings)} Alzheimer's disease structural MRI"
    hits = [] if image_bytes is not None else _retrieve_for_chat(query)
    system = [{"role": "system", "content": SYSTEM_PROMPT}]
    if context:
        system.append({"role": "system", "content": "CURRENT PATIENT CONTEXT (from the workspace):\n" + context[:4000]})
    if hits:
        lit = "\n\n".join(
            f"[{i + 1}] {h['title']} ({h['year']})\n{h['abstract'][:1200]}" for i, h in enumerate(hits)
        )
        system.append({"role": "system", "content": CHAT_RAG_NOTE + "\n\n" + lit})
    system.append({"role": "system", "content": f"Reply in {screen['language']}, the language of the user's latest "
                                                 "message. Do not switch to any other language."})

    try:
        content = [{"type": "text", "text": text or "Describe this MRI scan."}]
        if image_bytes is not None:
            b64 = base64.b64encode(image_bytes).decode("utf-8")
            content.append(
                {"type": "image_url", "image_url": {"url": f"data:{image_mime};base64,{b64}"}}
            )
        resp = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=system + _history_messages(history) + [{"role": "user", "content": content}],
        )
        reply = resp.choices[0].message.content or ""
    except Exception as exc:  # network / quota / rate-limit -> clean offline reply (no raw error in UI)
        print(f"[chatbot] chat LLM unavailable ({exc}); using offline assistant.")
        return {"message": _offline_answer(text, image_bytes is not None), "sources": [], "offline": True}

    check = {"checked": 0, "supported": 0, "removed": 0}
    if hits:
        reply, check = verify_citations(reply, [(h["title"], h["abstract"]) for h in hits])
    cited = set()
    for group in re.findall(r"\[([\d,\s\u2013-]+)\]", reply):  # [1], [2, 3], [4-5]
        cited.update(_expand(group))
    sources = [
        {"n": i + 1, "title": h["title"], "year": h["year"], "url": h.get("url", "")}
        for i, h in enumerate(hits) if (i + 1) in cited
    ]
    return {"message": reply, "sources": sources, "citation_check": check}
