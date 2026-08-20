"""Alzheimer MRI classification and Grad-CAM++ heatmap generation.

The service ALWAYS uses the trained VGG-19 model (TensorFlow). There is no
heuristic/NumPy fallback: if the model cannot be loaded the service fails loudly
rather than fabricating a prediction — the correct behaviour for a diagnostic
assistant (never invent a diagnosis).

Mirrors ``research/scripts/gradcam_plus_plus.py`` /
``research/notebooks/final_alzheimer_model.ipynb``.
"""
import io
import os
import base64

import numpy as np
from PIL import Image

import config
from config import DEMENTIA_CLASSES

# Trained TensorFlow model (loaded lazily, once).
_tf = None
_model = None


def _load_model():
    """Load TensorFlow + the trained model once. Raise if it is unavailable."""
    global _tf, _model
    if _model is not None:
        return _model
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


# Model input preprocessing (config-driven; training used "raw" 0-255 pixels).
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
# IMPORTANT: this is a BINARY classifier (Non Demented vs Demented). The training set
# (vedjosh/alzheimer-mri) has only two folders -- Non_Demented and Demented -- so the
# labels are {0, 1}. The saved model's head is Dense(4, softmax) for legacy reasons, but
# only neuron 0 (Non Demented) and neuron 3 carry signal; neurons 1 & 2 ("Very mild" /
# "Mild") never received a training example and are dead -- verified across the dataset,
# where argmax is only ever neuron 0 or neuron 3. So we report the honest binary decision
# the model can actually make instead of a fabricated 4-level severity.
BINARY_CLASSES = ["Non Demented", "Demented"]


def classify(file_bytes):
    """Return (label, dementia_probability_percent, per_class_probs, message).

    Binary: P(Non Demented) is softmax neuron 0; P(Demented) = 1 - P(Non Demented),
    which sums the remaining neurons and is robust to the model's legacy 4-wide head.
    """
    model = _load_model()
    side = _model_side(model)
    img = load_image(file_bytes, size=(side, side))
    arr = _model_input(model, img)
    preds = model.predict(arr, verbose=0)[0]
    probs = np.asarray(preds, dtype=np.float64)
    p_non = float(probs[0])                      # neuron 0 = Non Demented (trained)
    p_dem = float(1.0 - p_non)                   # all remaining mass = Demented
    label = "Non Demented" if p_non >= 0.5 else "Demented"
    per_class = {"Non Demented": round(p_non * 100, 2), "Demented": round(p_dem * 100, 2)}
    message = f"Predicted class: {label} (binary VGG-19 classifier: Demented vs Non Demented)."
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


def _tf_gradcam_pp(model, img: Image.Image):
    """Real Grad-CAM++ on the last conv layer of the trained model."""
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
        raise RuntimeError("No 4-D convolutional layer found for Grad-CAM++.")
    # Build a model exposing (conv activations, predictions).
    grad_model = tf.keras.models.Model(model.inputs, [model.get_layer(conv_layer).output, model.output])
    arr_t = tf.convert_to_tensor(arr, dtype=tf.float32)
    with tf.GradientTape() as tape:
        tape.watch(arr_t)
        outputs = grad_model(arr_t)
        conv_out, preds = outputs[0], outputs[1]
        if isinstance(conv_out, (list, tuple)):
            conv_out = conv_out[0]
        if isinstance(preds, (list, tuple)):
            preds = preds[0]
        class_idx = tf.argmax(preds[0])
        loss = preds[:, class_idx]
    grads = tape.gradient(loss, conv_out)
    if grads is None:
        raise RuntimeError("Grad-CAM++ gradient computation returned None.")
    # Drop the batch axis and work on the single-image maps, so every spatial
    # reduction below is over (H, W) PER CHANNEL — the correct Grad-CAM++ form.
    # (A previous version reduced over axis=(0,1) on a (1,H,W,C) tensor, i.e. over
    #  (batch, H), leaking a spurious width dependence into the channel weights.)
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
    # Channel weights w_k = sum_{ij} alpha_ij^k * relu(dY^c / dA_ij^k)  -> (C,)
    weights = tf.reduce_sum(alphas * tf.maximum(grad, 0.0), axis=(0, 1))
    cam = tf.reduce_sum(weights * conv, axis=-1)          # (H, W)
    cam = tf.maximum(cam, 0)
    cam = cam / (tf.reduce_max(cam) + 1e-8)
    cam = tf.image.resize(cam[..., tf.newaxis], (side, side)).numpy().squeeze()
    return cam


def grad_cam(file_bytes, alpha=0.5):
    """Return (overlay_data_url, original_data_url) — Grad-CAM++ on the trained model."""
    img = load_image(file_bytes)
    model = _load_model()
    cam = _tf_gradcam_pp(model, img)

    # Resize the activation map to the display image size before colouring/overlaying.
    cam_img = Image.fromarray((np.clip(cam, 0, 1) * 255).astype(np.uint8)).resize(img.size)
    cam = np.asarray(cam_img, dtype=np.float64) / 255.0
    heat_rgb = _jet_colormap(cam)
    base = np.asarray(img, dtype=np.float64)
    overlay = (base * (1 - alpha) + heat_rgb * alpha).clip(0, 255).astype(np.uint8)
    overlay_img = Image.fromarray(overlay)
    return _to_data_url(overlay_img), _to_data_url(img)
