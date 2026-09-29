"""Shared configuration and environment discovery for the ML service."""
import os
import glob

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except Exception:  # python-dotenv is optional
    pass

# Binary task: Non Demented vs Demented. The v2 model has a 2-way softmax head; the legacy v1
# model's 4-wide head is collapsed to the same decision in inference.classify().
DEMENTIA_CLASSES = ["Non Demented", "Demented"]

PORT = int(os.environ.get("PORT", "5001"))

# Alzheimer model: either an explicit local path, or a (private) Hugging Face repo
# that is downloaded and cached on first use.
ALZHEIMER_MODEL_PATH = os.environ.get("ALZHEIMER_MODEL_PATH", "").strip()
ALZHEIMER_MODEL_REPO = os.environ.get(
    "ALZHEIMER_MODEL_REPO", "malharinamdar/alzheimer-prediction-model"
).strip()
ALZHEIMER_MODEL_FILE = os.environ.get("ALZHEIMER_MODEL_FILE", "alzheimer_model.h5").strip()
HF_TOKEN = os.environ.get("HF_TOKEN", "").strip() or os.environ.get("HUGGINGFACE_TOKEN", "").strip()
GRADCAM_LAYER = os.environ.get("GRADCAM_LAYER", "").strip()
# How to scale pixels before the model: "vgg19" (Keras ImageNet preprocess_input -- the v2 model),
# "raw" (0..255 -- the v1 model) or "div255" (0..1). "auto" probes the model on a sample slice.
MODEL_PREPROCESS = os.environ.get("MODEL_PREPROCESS", "auto").strip().lower()

MODEL_CACHE_DIR = os.path.join(os.path.dirname(__file__), "models")

# P(Demented) at or above which a slice is labelled Demented (0-1). The v2 model uses 0.13, the
# slice-level threshold that maximised balanced accuracy on the validation patients
# (research/results/v2/metrics.json); 0.5 is plain argmax.
DECISION_THRESHOLD = float(os.environ.get("DECISION_THRESHOLD", "0.5"))

# Held-out test performance of the deployed v2 model (research/results/v2/metrics.json). Passed to
# the rationale so it can weigh a single-slice score like any other test result.
MODEL_EVAL_SUMMARY = (
    "52 held-out OASIS-1 patients (no overlap with training). Per slice, at this threshold: "
    "sensitivity 89%, specificity 67%, ROC-AUC 0.85; positive likelihood ratio 2.7, negative likelihood "
    "ratio 0.16, so a Non Demented call shifts the odds more than a Demented call. "
    "Per patient (all slices averaged): ROC-AUC 0.89."
)

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4-turbo").strip()


def resolve_model_path():
    """Return a local path to the trained Alzheimer model, or None.

    Priority: explicit ALZHEIMER_MODEL_PATH -> download from Hugging Face repo.
    The HF download is cached under ml_service/models, so it only happens once.
    """
    if ALZHEIMER_MODEL_PATH:
        path = ALZHEIMER_MODEL_PATH
        if not os.path.isabs(path):  # relative paths are relative to ml_service/
            path = os.path.join(os.path.dirname(__file__), path)
        if os.path.exists(path):
            return path
    if not ALZHEIMER_MODEL_REPO or not ALZHEIMER_MODEL_FILE:
        return None
    try:
        from huggingface_hub import hf_hub_download

        os.makedirs(MODEL_CACHE_DIR, exist_ok=True)
        print(
            f"[config] Resolving model {ALZHEIMER_MODEL_REPO}/{ALZHEIMER_MODEL_FILE} "
            f"from Hugging Face (cached in {MODEL_CACHE_DIR})..."
        )
        path = hf_hub_download(
            repo_id=ALZHEIMER_MODEL_REPO,
            filename=ALZHEIMER_MODEL_FILE,
            token=HF_TOKEN or None,
            cache_dir=MODEL_CACHE_DIR,
        )
        print(f"[config] Model available at {path}")
        return path
    except Exception as exc:  # network / auth / missing dep
        print(f"[config] Could not fetch model from Hugging Face ({exc}).")
        return None


def discover_fsldir():
    """Return a usable FSLDIR, checking the env var then common install paths."""
    candidates = []
    if os.environ.get("FSLDIR"):
        candidates.append(os.environ["FSLDIR"])
    candidates += [
        os.path.expanduser("~/fsl"),
        os.path.expanduser("~/fsl/share/fsl"),
        "/usr/local/fsl",
        "/opt/fsl",
    ]
    for base in candidates:
        if base and os.path.exists(os.path.join(base, "bin", "fslstats")):
            return base
        # Homebrew/conda-style layout: <base>/share/fsl/bin
        nested = glob.glob(os.path.join(base, "**", "bin", "fslstats"), recursive=True)
        if nested:
            return os.path.dirname(os.path.dirname(nested[0]))
    return None


FSLDIR = discover_fsldir()


def fsl_available():
    return FSLDIR is not None


def fsl_env():
    """Environment dict with FSL on PATH, for subprocess calls."""
    env = dict(os.environ)
    if FSLDIR:
        env["FSLDIR"] = FSLDIR
        env["PATH"] = os.path.join(FSLDIR, "bin") + os.pathsep + env.get("PATH", "")
        env.setdefault("FSLOUTPUTTYPE", "NIFTI_GZ")
    return env
