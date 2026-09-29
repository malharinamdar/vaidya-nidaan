"""Deploy the Flask ML service to Modal (https://modal.com) as a scale-to-zero web endpoint.

Why Modal and not Vercel: the service needs TensorFlow + the 80 MB VGG-19 weights, FSL
binaries and a Chroma index, far beyond a Vercel function's size and time limits.

The image carries only the FSL tools the pipeline calls (BET, FAST, fslstats and the
fslpy helper scripts) from FSL's public conda channel, the trained model file, and the
prebuilt PubMed Chroma store.

One-time setup (from ml_service/):
    python3.12 -m venv .modal-venv && .modal-venv/bin/pip install modal
    .modal-venv/bin/modal token new                  # opens the browser to authorise
    ./deploy_modal.sh                                # creates the secret + deploys

Secrets (Modal secret "vaidya-nidaan"): OPENAI_API_KEY, JWT_SECRET (same as the API
gateway), CORS_ORIGINS (the Vercel frontend URL), optional REDIS_URL (shared cache).
"""
import modal

FSL_CHANNEL = "https://fsl.fmrib.ox.ac.uk/fsldownloads/fslconda/public/"
APP_DIR = "/root/app"

image = (
    modal.Image.micromamba(python_version="3.12")
    # The micromamba base ships without a system CA bundle; without it TLS to OpenAI and
    # the embedding-model download fails certificate verification.
    .apt_install("ca-certificates")
    .micromamba_install(
        "fsl-bet2", "fsl-fast4", "fsl-avwutils", "fslpy",
        channels=[FSL_CHANNEL, "conda-forge"],
    )
    .pip_install_from_requirements("requirements.txt")
    .env({
        "SSL_CERT_FILE": "/etc/ssl/certs/ca-certificates.crt",
        "REQUESTS_CA_BUNDLE": "/etc/ssl/certs/ca-certificates.crt",
        "FSLDIR": "/opt/conda",
        "FSLOUTPUTTYPE": "NIFTI_GZ",
        "ALZHEIMER_MODEL_PATH": f"{APP_DIR}/models/alzheimer_model.h5",
        "MODEL_PREPROCESS": "raw",
        "GRADCAM_LAYER": "block5_conv4",
        "OPENAI_MODEL": "gpt-4o",
    })
    # Bake Chroma's default embedding model into the image so the first request doesn't download it.
    .run_commands(
        "python -c \"from chromadb.utils.embedding_functions import DefaultEmbeddingFunction as E; "
        "print(len(E()(['warm-up'])[0]), 'dim embedder ready')\""
    )
    # The service code, model weights and RAG store are MOUNTED (not copied): Modal re-syncs
    # them on every `modal deploy`, so code changes always ship. (A copy=True layer is cached.)
    .add_local_dir(
        ".", APP_DIR,
        ignore=[".venv", ".modal-venv", "**/__pycache__", "*.pyc", ".env", "models/models--*", "models/CACHEDIR.TAG"],
    )
)

app = modal.App("vaidya-nidaan-ml", image=image)


@app.function(
    secrets=[modal.Secret.from_name("vaidya-nidaan")],
    cpu=2.0,
    memory=4096,
    timeout=300,            # a full report (FSL + GPT-4o) takes ~20-60 s
    scaledown_window=600,   # stay warm 10 min after the last request
    max_containers=3,       # hard cap on spend
)
@modal.concurrent(max_inputs=4)
@modal.wsgi_app()
def flask_app():
    import os
    import sys
    import threading

    os.chdir(APP_DIR)
    sys.path.insert(0, APP_DIR)
    from app import app as flask
    import inference

    # Load TensorFlow + the VGG-19 weights in the background as soon as the container
    # starts (the frontend pings /health on page load), so the first scan is fast.
    threading.Thread(target=inference._load_model, daemon=True).start()
    return flask
