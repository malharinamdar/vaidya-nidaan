"""Alzheimer MRI classification and Grad-CAM++ heatmap generation.

Two execution paths:

* If TensorFlow is installed AND a trained model is available, a real VGG-19
  classifier + Grad-CAM++ (mirrors ``research/scripts/gradcam_plus_plus.py`` /
  ``research/notebooks/final_alzheimer_model.ipynb``)
  is used.
* Otherwise a deterministic, dependency-light NumPy/Pillow pipeline produces a
  classification and a saliency-based heatmap so the end-to-end flow still works.
"""
import io
import os
import base64
import hashlib

import numpy as np
from PIL import Image, ImageFilter

import config
from config import DEMENTIA_CLASSES

# Optional TensorFlow model (loaded lazily, once).
_tf = None
_model = None
_model_tried = False


def _try_load_model():
    """Attempt to load TensorFlow + the trained model. Returns the model or None."""
    global _tf, _model, _model_tried
    if _model_tried:
        return _model
    _model_tried = True
    model_path = config.resolve_model_path()
    if not model_path:
        print("[inference] No trained model available; using NumPy fallback classifier.")
        return None
    try:
        import tensorflow as tf  # noqa
        _tf = tf
        _model = tf.keras.models.load_model(model_path, compile=False)
        print(f"[inference] Loaded Keras model from {model_path}; input_shape={_model.input_shape}")
        return _model
    except Exception as exc:  # pragma: no cover - depends on optional deps
        print(f"[inference] Could not load TensorFlow model ({exc}); using NumPy fallback.")
        return None


def backend_name():
    return "tensorflow" if _try_load_model() is not None else "numpy-fallback"


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


# Model input preprocessing (configurable; "auto" probes the model once).
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
    return arr / 255.0  # "div255" default


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
def _fallback_logits(img: Image.Image):
    """Deterministic 4-class logits derived from grey-matter intensity features.

    This is a heuristic stand-in for the trained VGG-19 head. It is fully
    deterministic for a given image (so the demo is reproducible) and is biased
    by how much of the brain shows low-intensity / atrophy-like regions.
    """
    gray = np.asarray(img.convert("L"), dtype=np.float64) / 255.0
    mean = gray.mean()
    std = gray.std()
    # Fraction of dark (potential atrophy / ventricle) vs bright tissue.
    dark_frac = float((gray < 0.25).mean())
    mid_frac = float(((gray >= 0.25) & (gray < 0.6)).mean())
    # Stable per-image jitter so visually-similar scans don't all collapse to one class.
    h = int(hashlib.sha256(gray.round(3).tobytes()).hexdigest()[:8], 16)
    jitter = ((h % 1000) / 1000.0 - 0.5) * 0.4

    severity = dark_frac * 2.2 + (0.5 - mean) * 1.5 + (0.2 - std) * 1.0 + jitter
    # Map a single severity scalar onto 4 ordered class logits.
    logits = [
        2.0 - 3.0 * severity,        # Non Demented
        0.8 + 1.0 * severity,        # Very mild
        -0.2 + 2.2 * severity,       # Mild
        -1.0 + 3.0 * severity + mid_frac,  # Moderate
    ]
    return np.array(logits)


def classify(file_bytes):
    """Return (label, probability_percent, per_class_probs, message)."""
    model = _try_load_model()
    if model is not None:
        # Real model path: input shape inferred from the model (128 or 224).
        side = _model_side(model)
        img = load_image(file_bytes, size=(side, side))
        arr = _model_input(model, img)
        preds = model.predict(arr, verbose=0)[0]
        probs = np.asarray(preds, dtype=np.float64)
        if probs.shape[0] != len(DEMENTIA_CLASSES):
            # Binary model (demented / non-demented) -> expand to label set.
            probs = _softmax([1 - probs[0], probs[0] * 0.6, probs[0] * 0.3, probs[0] * 0.1])
        backend = "tensorflow"
    else:
        img = load_image(file_bytes)
        probs = _softmax(_fallback_logits(img))
        backend = "numpy-fallback"

    idx = int(np.argmax(probs))
    label = DEMENTIA_CLASSES[idx]
    # Probability of *any* dementia = 1 - P(Non Demented).
    alzheimer_probability = float((1.0 - probs[0]) * 100.0)
    per_class = {DEMENTIA_CLASSES[i]: round(float(p) * 100, 2) for i, p in enumerate(probs)}
    message = (
        f"Predicted class: {label} "
        f"({'trained model' if backend == 'tensorflow' else 'heuristic fallback'})."
    )
    return label, round(alzheimer_probability, 2), per_class, message


# Grad-CAM++ heatmap.
def _jet_colormap(gray01):
    """Map a 0..1 array to RGB using a Matplotlib-'jet'-like colormap (pure NumPy)."""
    x = np.clip(gray01, 0.0, 1.0)
    four = 4.0 * x
    r = np.clip(np.minimum(four - 1.5, -four + 4.5), 0, 1)
    g = np.clip(np.minimum(four - 0.5, -four + 3.5), 0, 1)
    b = np.clip(np.minimum(four + 0.5, -four + 2.5), 0, 1)
    return (np.stack([r, g, b], axis=-1) * 255).astype(np.uint8)


def _fallback_heatmap(img: Image.Image):
    """Saliency heatmap from intensity-gradient magnitude (Sobel via NumPy)."""
    gray = np.asarray(img.convert("L").filter(ImageFilter.GaussianBlur(1)), dtype=np.float64)
    kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float64)
    ky = kx.T

    def conv2d(a, k):
        p = np.pad(a, 1, mode="edge")
        out = np.zeros_like(a)
        for i in range(3):
            for j in range(3):
                out += k[i, j] * p[i:i + a.shape[0], j:j + a.shape[1]]
        return out

    mag = np.hypot(conv2d(gray, kx), conv2d(gray, ky))
    # Emphasise central (medial-temporal) regions and smooth.
    h, w = mag.shape
    yy, xx = np.mgrid[0:h, 0:w]
    center = np.exp(-(((yy - h / 2) ** 2 + (xx - w / 2) ** 2) / (2 * (0.35 * h) ** 2)))
    sal = mag * (0.5 + 0.5 * center)
    sal = np.asarray(
        Image.fromarray((sal / (sal.max() + 1e-8) * 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(4)
        ),
        dtype=np.float64,
    )
    sal /= sal.max() + 1e-8
    return sal


def _tf_gradcam_pp(model, img: Image.Image):
    """Real Grad-CAM++ on the last conv layer (best-effort)."""
    tf = _tf
    side = _model_side(model)
    if img.size != (side, side):
        img = img.resize((side, side))
    arr = _model_input(model, img)
    # Prefer the configured layer (VGG-19 last conv block); else find the last conv layer.
    conv_layer = None
    if config.GRADCAM_LAYER:
        try:
            model.get_layer(config.GRADCAM_LAYER)
            conv_layer = config.GRADCAM_LAYER
        except Exception:
            conv_layer = None
    if conv_layer is None:
        for layer in reversed(model.layers):
            try:
                if len(layer.output.shape) == 4:
                    conv_layer = layer.name
                    break
            except Exception:
                continue
    if conv_layer is None:
        return None
    # Build a model exposing (conv activations, predictions). Pass model.inputs
    # (the list of input tensors) directly — wrapping it in another list breaks
    # the call signature. Mirrors research/scripts/gradcam_plus_plus.py.
    grad_model = tf.keras.models.Model(model.inputs, [model.get_layer(conv_layer).output, model.output])
    arr_t = tf.convert_to_tensor(arr, dtype=tf.float32)
    with tf.GradientTape() as tape:
        tape.watch(arr_t)
        outputs = grad_model(arr_t)
        conv_out, preds = outputs[0], outputs[1]
        # This model's output is wrapped in a list ([tensor]); unwrap it.
        if isinstance(conv_out, (list, tuple)):
            conv_out = conv_out[0]
        if isinstance(preds, (list, tuple)):
            preds = preds[0]
        class_idx = tf.argmax(preds[0])
        loss = preds[:, class_idx]
    grads = tape.gradient(loss, conv_out)
    if grads is None:
        return None
    first = grads
    second = grads * grads
    third = grads * grads * grads
    global_sum = tf.reduce_sum(conv_out, axis=(0, 1, 2))
    denom = second * 2.0 + third * global_sum
    denom = tf.where(denom != 0.0, denom, tf.ones_like(denom))
    alphas = second / denom
    alphas /= tf.reduce_sum(alphas, axis=(0, 1)) + 1e-8
    weights = tf.reduce_sum(first * alphas, axis=(0, 1))
    cam = tf.reduce_sum(weights * conv_out[0], axis=-1)
    cam = tf.maximum(cam, 0)
    cam = cam / (tf.reduce_max(cam) + 1e-8)
    cam = tf.image.resize(cam[..., tf.newaxis], (side, side)).numpy().squeeze()
    return cam


def grad_cam(file_bytes, alpha=0.5):
    """Return (overlay_data_url, original_data_url)."""
    img = load_image(file_bytes)
    model = _try_load_model()
    cam = None
    if model is not None:
        try:
            cam = _tf_gradcam_pp(model, img)
        except Exception as exc:  # pragma: no cover
            print(f"[inference] Grad-CAM++ on model failed ({exc}); using fallback heatmap.")
    if cam is None:
        cam = _fallback_heatmap(img)

    # Resize the activation map to the display image size before colouring/overlaying.
    cam_img = Image.fromarray((np.clip(cam, 0, 1) * 255).astype(np.uint8)).resize(img.size)
    cam = np.asarray(cam_img, dtype=np.float64) / 255.0
    heat_rgb = _jet_colormap(cam)
    base = np.asarray(img, dtype=np.float64)
    overlay = (base * (1 - alpha) + heat_rgb * alpha).clip(0, 255).astype(np.uint8)
    overlay_img = Image.fromarray(overlay)
    return _to_data_url(overlay_img), _to_data_url(img)
