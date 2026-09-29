"""Alzheimer MRI classification and Grad-CAM++ heatmap generation.

The service ALWAYS uses the trained VGG-19 model (TensorFlow). There is no
heuristic/NumPy fallback: if the model cannot be loaded the service fails loudly
rather than fabricating a prediction — the correct behaviour for a diagnostic
assistant (never invent a diagnosis).

The deployed model is trained in ``research/notebooks/alzheimer_model_v2.ipynb``; its
Grad-CAM++ cell uses the same algorithm as ``_tf_gradcam_pp`` below.
"""
import io
import os
import base64
import threading

import numpy as np
from PIL import Image

import config
from config import DEMENTIA_CLASSES

# Trained TensorFlow model (loaded lazily, once). TF inference and Grad-CAM gradients run
# under one lock so concurrent requests in the same container don't interleave.
_tf = None
_model = None
_tf_lock = threading.RLock()


def _load_model():
    """Load TensorFlow + the trained model once. Raise if it is unavailable."""
    global _tf, _model
    if _model is not None:
        return _model
    with _tf_lock:
        if _model is None:
            _load_model_unlocked()
    return _model


def _load_model_unlocked():
    global _tf, _model
    model_path = config.resolve_model_path()
    if not model_path:
        raise RuntimeError(
            "No trained Alzheimer model available. Set ALZHEIMER_MODEL_PATH to the "
            "local .h5 file (or configure HF_TOKEN + ALZHEIMER_MODEL_REPO)."
        )
    import tensorflow as tf  # noqa
    _tf = tf
    _model = tf.keras.models.load_model(model_path, compile=False)
    print(f"[inference] Loaded Keras model from {model_path}; input_shape={_model.input_shape}")
    return _model


def backend_name():
    """Reported by /health. The service only runs on the real model now."""
    return "tensorflow"


# Image helpers.
def load_image(file_bytes, size=(224, 224)):
    img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
    return img.resize(size)


def _to_data_url(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")


def _softmax(x):
    x = np.asarray(x, dtype=np.float64)
    e = np.exp(x - np.max(x))
    return e / e.sum()


# Model input preprocessing (config-driven: "vgg19" for the v2 model, "raw" 0-255 for v1).
def _model_side(model):
    try:
        shape = model.input_shape
        if isinstance(shape, list):
            shape = shape[0]
        side = shape[1] if shape and shape[1] else 128
        return int(side)
    except Exception:
        return 128


def _apply_preprocess(arr255, mode):
    arr = arr255.astype(np.float32)
    if mode == "raw":
        return arr
    if mode == "vgg19":  # RGB->BGR, subtract ImageNet means (Keras preprocess_input)
        x = arr[..., ::-1].copy()
        x[..., 0] -= 103.939
        x[..., 1] -= 116.779
        x[..., 2] -= 123.68
        return x
    return arr / 255.0  # "div255"


_resolved_preprocess = None


def _resolve_preprocess(model, side):
    """Decide the pixel scaling. Honors config; 'auto' probes the bundled sample MRI."""
    global _resolved_preprocess
    if _resolved_preprocess:
        return _resolved_preprocess
    mode = config.MODEL_PREPROCESS
    if mode in ("div255", "raw", "vgg19"):
        _resolved_preprocess = mode
        return mode
    sample = os.path.join(os.path.dirname(__file__), "..", "docs", "samples", "MRI_blackandwhite.png")
    try:
        with open(sample, "rb") as fh:
            img = load_image(fh.read(), size=(side, side))
    except Exception:
        img = Image.new("RGB", (side, side), (127, 127, 127))
    arr255 = np.asarray(img.convert("RGB"), dtype=np.float32)
    best, best_conf = "div255", -1.0
    for m in ("div255", "raw", "vgg19"):
        try:
            x = np.expand_dims(_apply_preprocess(arr255, m), 0)
            p = np.asarray(model.predict(x, verbose=0)[0], dtype=np.float64)
            conf = float(np.max(p))
            if conf > best_conf:
                best_conf, best = conf, m
        except Exception:
            continue
    _resolved_preprocess = best
    print(f"[inference] auto preprocessing -> {best} (peak confidence {best_conf:.3f})")
    return best


def _model_input(model, img):
    side = _model_side(model)
    if img.size != (side, side):
        img = img.resize((side, side))
    arr255 = np.asarray(img.convert("RGB"), dtype=np.float32)
    mode = _resolve_preprocess(model, side)
    return np.expand_dims(_apply_preprocess(arr255, mode), 0)


# Classification.
#
# Binary classifier: Non Demented vs Demented. Output neuron 0 is Non Demented in both the v2
# model (2-way softmax) and the legacy v1 model (4-wide head of which only neurons 0 and 3 were
# trained), so P(Demented) = 1 - P(Non Demented) works for either.
BINARY_CLASSES = ["Non Demented", "Demented"]


def classify(file_bytes):
    """Return (label, dementia_probability_percent, per_class_probs, message).

    P(Non Demented) is softmax neuron 0 and P(Demented) = 1 - P(Non Demented); the label uses
    config.DECISION_THRESHOLD (0.13 for the v2 model, tuned on validation patients).
    """
    model = _load_model()
    side = _model_side(model)
    img = load_image(file_bytes, size=(side, side))
    with _tf_lock:
        arr = _model_input(model, img)
        preds = model.predict(arr, verbose=0)[0]
    probs = np.asarray(preds, dtype=np.float64)
    p_non = float(probs[0])                      # neuron 0 = Non Demented
    p_dem = float(1.0 - p_non)                   # remaining mass = Demented
    label = "Demented" if p_dem >= config.DECISION_THRESHOLD else "Non Demented"
    per_class = {"Non Demented": round(p_non * 100, 2), "Demented": round(p_dem * 100, 2)}
    message = (f"Predicted class: {label} (binary VGG-19 classifier; Demented when "
               f"P(Demented) >= {config.DECISION_THRESHOLD * 100:g}%).")
    return label, round(p_dem * 100, 2), per_class, message


# Grad-CAM++ heatmap (on the trained VGG-19).
def _jet_colormap(gray01):
    """Map a 0..1 array to RGB using a Matplotlib-'jet'-like colormap (pure NumPy)."""
    x = np.clip(gray01, 0.0, 1.0)
    four = 4.0 * x
    r = np.clip(np.minimum(four - 1.5, -four + 4.5), 0, 1)
    g = np.clip(np.minimum(four - 0.5, -four + 3.5), 0, 1)
    b = np.clip(np.minimum(four + 0.5, -four + 2.5), 0, 1)
    return (np.stack([r, g, b], axis=-1) * 255).astype(np.uint8)


def _find_conv_layer(model):
    """The configured Grad-CAM layer (VGG-19 block5_conv4), else the last 4-D layer."""
    if config.GRADCAM_LAYER:
        try:
            model.get_layer(config.GRADCAM_LAYER)
            return config.GRADCAM_LAYER
        except Exception:
            pass
    for layer in reversed(model.layers):
        try:
            if len(layer.output.shape) == 4:
                return layer.name
        except Exception:
            continue
    raise RuntimeError("No 4-D convolutional layer found for Grad-CAM++.")


def _target_neuron(probs):
    """Output neuron to explain, consistent with the binary decision in classify():
    neuron 0 when Non Demented wins, else the strongest of the remaining (Demented) neurons."""
    probs = np.asarray(probs, dtype=np.float64)
    if 1.0 - probs[0] < config.DECISION_THRESHOLD:
        return 0
    return 1 + int(np.argmax(probs[1:]))


def _tf_gradcam_pp(model, file_bytes):
    """Real Grad-CAM++ on the last conv layer of the trained model.

    Target = the BINARY LOG-ODDS of the predicted class,
        log p(Non Demented) / p(Demented) = z_0 - logsumexp(z_1..z_n)   (sign flipped for Demented),
    computed from the pre-softmax logits. Two reasons:
      * the softmax output saturates on confident predictions (p ~ 1.0 gives dp/dA ~ p(1-p):
        max |grad| was 5e-8 on the demented sample), making the map numerically fragile;
      * a single raw logit also rewards evidence that raises BOTH classes; the log-odds only
        counts evidence that separates the two, i.e. what actually drove the decision.

    The model sees exactly the input classify() sees (original -> side x side).
    Returns (cam in [0,1] at side x side, target neuron index).
    """
    tf = _tf
    side = _model_side(model)
    arr = _model_input(model, load_image(file_bytes, size=(side, side)))
    conv_layer = _find_conv_layer(model)
    head = model.layers[-1]                         # final Dense (softmax activation)
    kernel, bias = head.get_weights()
    grad_model = tf.keras.models.Model(model.inputs, [model.get_layer(conv_layer).output, head.input])
    arr_t = tf.convert_to_tensor(arr, dtype=tf.float32)
    with tf.GradientTape() as tape:
        outputs = grad_model(arr_t)
        conv_out, penult = outputs[0], outputs[1]
        if isinstance(conv_out, (list, tuple)):
            conv_out = conv_out[0]
        if isinstance(penult, (list, tuple)):
            penult = penult[0]
        logits = tf.matmul(penult, kernel) + bias   # (1, n_classes), pre-softmax
        target = _target_neuron(tf.nn.softmax(logits)[0].numpy())
        log_odds_non = logits[:, 0] - tf.reduce_logsumexp(logits[:, 1:], axis=1)
        score = log_odds_non if target == 0 else -log_odds_non
    grads = tape.gradient(score, conv_out)
    if grads is None:
        raise RuntimeError("Grad-CAM++ gradient computation returned None.")
    # Drop the batch axis so every spatial reduction below is over (H, W) PER CHANNEL.
    # (An earlier version reduced over axis=(0,1) of a (1,H,W,C) tensor, i.e. (batch, H).)
    conv = conv_out[0]                 # (H, W, C)
    grad = grads[0]                    # (H, W, C)
    grad2 = grad * grad
    grad3 = grad2 * grad
    # Per-channel spatial sum of activations: sum_{ab} A^k_{ab}  -> (C,)
    global_sum = tf.reduce_sum(conv, axis=(0, 1))
    denom = 2.0 * grad2 + grad3 * global_sum
    denom = tf.where(denom != 0.0, denom, tf.ones_like(denom))
    alphas = grad2 / denom             # alpha_ij^kc, (H, W, C)
    alphas /= tf.reduce_sum(alphas, axis=(0, 1)) + 1e-8   # normalise per channel over (H, W)
    # Channel weights w_k = sum_{ij} alpha_ij^k * relu(dS^c / dA_ij^k)  -> (C,)
    weights = tf.reduce_sum(alphas * tf.maximum(grad, 0.0), axis=(0, 1))
    cam = tf.reduce_sum(weights * conv, axis=-1)          # (H, W)
    cam = tf.maximum(cam, 0)
    cam = cam / (tf.reduce_max(cam) + 1e-8)
    cam = tf.image.resize(cam[..., tf.newaxis], (side, side)).numpy().squeeze()
    return cam, target


def _display_image(file_bytes, max_side=512):
    """The upload at its ORIGINAL aspect ratio (longest side = max_side), for display."""
    img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
    scale = max_side / max(img.size)
    return img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))))


def grad_cam(file_bytes, alpha=0.5):
    """Grad-CAM++ on the trained model.

    Returns a dict with data-URL PNGs (``overlay`` blended at ``alpha``, ``original``,
    and a transparent ``heatmap`` layer the UI can blend at any opacity) plus
    ``tissue_attribution_pct``: the share of the attribution mass that falls on
    non-background pixels (a sanity check that the map isn't lighting up empty space).
    """
    model = _load_model()
    with _tf_lock:
        cam, target = _tf_gradcam_pp(model, file_bytes)
    img = _display_image(file_bytes)
    # The model saw a square resize of the upload, so stretching the map back to the
    # original aspect is the exact inverse of that resize.
    cam = np.asarray(
        Image.fromarray((np.clip(cam, 0, 1) * 255).astype(np.uint8)).resize(img.size, Image.BILINEAR),
        dtype=np.float64,
    ) / 255.0
    heat_rgb = _jet_colormap(cam)
    base = np.asarray(img, dtype=np.float64)
    overlay = (base * (1 - alpha) + heat_rgb * alpha).clip(0, 255).astype(np.uint8)
    heat_rgba = np.dstack([heat_rgb, (np.clip(cam, 0, 1) ** 0.8 * 255).astype(np.uint8)])

    gray = base.mean(axis=2) / 255.0
    tissue = gray > 0.08
    mass = float(cam.sum())
    tissue_pct = round(float((cam * tissue).sum()) / mass * 100, 1) if mass > 0 else None
    # Where the map concentrates, in IMAGE coordinates (anatomical orientation depends on the scan).
    hot = cam >= 0.5
    hot_area_pct = round(float(hot.mean()) * 100, 1)
    py, px = np.unravel_index(int(np.argmax(cam)), cam.shape)
    rows = ["upper", "central", "lower"][min(2, int(3 * py / cam.shape[0]))]
    cols = ["left", "central", "right"][min(2, int(3 * px / cam.shape[1]))]
    peak_region = "centre" if rows == cols == "central" else f"{rows}-{cols}".replace("central-", "mid-")
    return {
        "overlay": _to_data_url(Image.fromarray(overlay)),
        "original": _to_data_url(img),
        "heatmap": _to_data_url(Image.fromarray(heat_rgba, mode="RGBA")),
        "target_neuron": int(target),
        "layer": _find_conv_layer(model),
        "tissue_attribution_pct": tissue_pct,
        "hot_area_pct": hot_area_pct,          # share of the image with >= 50% of peak attribution
        "peak_region": peak_region,            # image-relative location of the strongest attribution
    }


# Input check: is this upload an MRI slice like the ones the model was trained on?
# A Mahalanobis out-of-distribution detector on global-average-pooled VGG-19 `block4_pool`
# features (ImageNet preprocessing). Statistics are fitted on OASIS-1 slices by
# build_ood_stats.py; block1-4 are frozen in both the v1 and v2 models, so they stay valid.
_OOD_PATH = os.path.join(os.path.dirname(__file__), "ood_stats.npz")
_ood = None
_feat_model = None


def _ood_stats():
    global _ood
    if _ood is None:
        if not os.path.exists(_OOD_PATH):
            _ood = {}
        else:
            z = np.load(_OOD_PATH)
            t = float(z["threshold"])
            _ood = {"mean": z["mean"].astype(np.float64), "precision": z["precision"].astype(np.float64),
                    "threshold": t, "reject": float(z["reject_threshold"]) if "reject_threshold" in z else 1.75 * t}
    return _ood


def ood_features(file_bytes_list):
    """(n, 512) pooled block4_pool features for raw image bytes."""
    global _feat_model
    model = _load_model()
    side = _model_side(model)
    with _tf_lock:
        if _feat_model is None:
            _feat_model = _tf.keras.Model(model.inputs, model.get_layer("block4_pool").output)
        x = np.stack([np.asarray(load_image(b, size=(side, side)), dtype=np.float32) for b in file_bytes_list])
        maps = _feat_model.predict(_apply_preprocess(x, "vgg19"), verbose=0)
    return maps.mean(axis=(1, 2)).astype(np.float64)


def mri_likeness(file_bytes):
    """Classify an upload against the OASIS training distribution.

    Returns {"status", "distance", "threshold", "reject_threshold"} where status is
      "ok"        -- within the range of real OASIS slices,
      "atypical"  -- MRI-like but framed differently (orientation, padding, plane),
      "not_mri"   -- far outside anything MRI-like (screenshots, photos, documents).
    Accepts everything as "ok" if no statistics have been fitted.
    """
    stats = _ood_stats()
    if not stats:
        return {"status": "ok", "distance": None, "threshold": None, "reject_threshold": None}
    d = ood_features([file_bytes])[0] - stats["mean"]
    dist = float(np.sqrt(d @ stats["precision"] @ d))
    status = "ok" if dist <= stats["threshold"] else ("atypical" if dist <= stats["reject"] else "not_mri")
    return {"status": status, "distance": round(dist, 1), "threshold": round(stats["threshold"], 1),
            "reject_threshold": round(stats["reject"], 1)}
