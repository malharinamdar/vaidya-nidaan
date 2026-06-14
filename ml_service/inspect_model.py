"""One-off: download + load the HF model, print its shape, and test a prediction."""
import os
import config
import inference

print("== Resolving model path (downloads from HF on first run) ==")
path = config.resolve_model_path()
print("model path:", path)

model = inference._try_load_model()
print("model loaded:", model is not None)
if model is not None:
    print("input_shape:", model.input_shape)
    print("output_shape:", model.output_shape)
    conv_layers = []
    for l in model.layers:
        try:
            if len(l.output.shape) == 4:
                conv_layers.append(l.name)
        except Exception:
            pass
    print("last conv layers:", conv_layers[-4:])

print("\n== Test classify on sample MRI ==")
sample = os.path.join(os.path.dirname(__file__), "..", "docs", "samples", "MRI_blackandwhite.png")
with open(sample, "rb") as fh:
    data = fh.read()
label, prob, per_class, message = inference.classify(data)
print("label:", label)
print("alzheimer_probability:", prob)
print("per_class:", per_class)
print("message:", message)
print("backend:", inference.backend_name())

print("\n== Test grad-cam ==")
overlay, mri = inference.grad_cam(data)
print("overlay data url length:", len(overlay))
print("mri data url length:", len(mri))
