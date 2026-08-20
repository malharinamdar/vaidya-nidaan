"""Input validation: a deterministic *plausibility filter* for brain-MRI uploads.

This is defense-in-depth, NOT a modality classifier. It cheaply rejects obviously
invalid uploads (colour photos, screenshots, logos, blank images) before they reach
the diagnostic model — it does not, and cannot, *prove* an image is an MRI. A separately
trained MRI-vs-non-MRI classifier would be the production-grade modality check; this
filter is the cheap, explainable, no-dependency first pass that sits in front of it.

Signals it uses (a brain-MRI slice as THIS model expects them):
  * effectively GREYSCALE  — the classifier was trained on greyscale slices,
  * a DARK background      — a real share of near-black pixels,
  * some tissue present    — not blank, not edge-to-edge bright.

Thresholds are conservative heuristics chosen on representative valid and invalid
uploads — tuned to reject obvious non-MRI inputs while rarely rejecting a valid MRI.
A colourised MRI or an annotated/oddly-cropped scan can still be rejected; that is an
accepted trade-off for a first-pass filter (the model-level checks remain downstream).

`is_mri(file_bytes)` returns (ok: bool, reason: str, details: dict).
"""
import io

import numpy as np
from PIL import Image

MIN_SIDE = 64              # a real scan isn't a tiny thumbnail
MAX_SATURATION = 0.10      # mean chroma; greyscale MRI ~0.00, colour images >> this
MIN_STD = 0.03             # reject blank / uniform images
MIN_DARK_FRACTION = 0.10   # MRI sits on a dark background
MIN_FG_FRACTION = 0.03     # some tissue must be present
MAX_FG_FRACTION = 0.92     # but not edge-to-edge bright (e.g. a bright screenshot)
MIN_CENTER_MARGIN = -0.05  # lenient: only reject clearly brightness-inverted images


def is_mri(file_bytes):
    """Return (ok, human_reason, details). A plausibility filter, not a proof of modality."""
    # 1) decode / file validation
    try:
        img = Image.open(io.BytesIO(file_bytes))
        img.load()  # force decode now so a truncated/corrupt file raises here
    except Exception:
        return False, "The uploaded file is not a readable image.", {}

    if img.width < MIN_SIDE or img.height < MIN_SIDE:
        return False, "The image resolution is too low for an MRI scan.", {"width": img.width, "height": img.height}

    arr = np.asarray(img.convert("RGB").resize((128, 128)), dtype=np.float32)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    gray = arr.mean(axis=2) / 255.0

    saturation = float(np.mean(np.maximum.reduce([r, g, b]) - np.minimum.reduce([r, g, b])) / 255.0)
    std = float(gray.std())
    dark_fraction = float((gray < 0.12).mean())
    fg_fraction = float((gray > 0.20).mean())
    h = gray.shape[0]
    border = np.concatenate([gray[:10].ravel(), gray[-10:].ravel(),
                             gray[:, :10].ravel(), gray[:, -10:].ravel()])
    center = gray[h // 4: 3 * h // 4, h // 4: 3 * h // 4]
    center_margin = float(center.mean() - border.mean())

    details = {"saturation": round(saturation, 3), "std": round(std, 3),
               "dark_fraction": round(dark_fraction, 3), "foreground_fraction": round(fg_fraction, 3),
               "center_margin": round(center_margin, 3)}

    # 2) plausibility gates (ordered cheap -> structural)
    if std < MIN_STD:
        return False, "The image appears blank or uniform.", details
    if saturation > MAX_SATURATION:
        return False, "This looks like a colour image; the model expects a greyscale MRI scan.", details
    if dark_fraction < MIN_DARK_FRACTION:
        return False, "This doesn't have the dark background typical of an MRI slice.", details
    if not (MIN_FG_FRACTION <= fg_fraction <= MAX_FG_FRACTION):
        return False, "This doesn't have the tissue-on-dark-background structure of an MRI.", details
    if center_margin < MIN_CENTER_MARGIN:
        return False, "The brightness pattern doesn't match brain tissue on a dark field.", details
    return True, "ok", details
