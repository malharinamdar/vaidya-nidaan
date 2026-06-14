"""MRI biomarker analysis using FSL.

Runs a real FSL pipeline (mirrors research/scripts/fsl_report.py / research/notebooks/report.ipynb):
  BET (brain extraction) -> fslstats (intensity + brain volume)
  FAST (3-class tissue segmentation) -> CSF / grey-matter / white-matter volumes

Any input is first turned into a NIfTI volume:
  * volumetric uploads (.nii/.nii.gz/.img) are loaded with nibabel,
  * 2D MRI images (png/jpg) are converted to a pseudo-3D volume so FAST can run.

Tissue *fractions* (CSF/GM/WM as % of brain) are reported alongside absolute
volumes; fractions are the clinically meaningful, scan-independent biomarkers.
A pure-image fallback is only used if FSL is unavailable.
"""
import io
import os
import subprocess
import tempfile

import numpy as np
from PIL import Image

from config import fsl_available, fsl_env

VOLUMETRIC_EXTS = (".nii", ".nii.gz", ".img", ".hdr")


def _run(cmd, timeout=600):
    res = subprocess.run(
        cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        universal_newlines=True, env=fsl_env(), timeout=timeout,
    )
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or f"command failed: {cmd}")
    return res.stdout.strip()


def _load_volume(file_bytes, filename, tmpdir, depth=10, max_side=128):
    """Return a path to a NIfTI volume built from the upload.

    2D images are downscaled (longest side -> ``max_side``) and stacked into a
    shallow pseudo-volume. FAST runtime scales with voxel count, and the
    clinically meaningful outputs (tissue *fractions* and ratios) are
    scale-invariant, so this keeps the web request responsive without changing
    the biomarkers that matter.
    """
    import nibabel as nib

    lower = (filename or "").lower()
    nii_path = os.path.join(tmpdir, "input.nii.gz")

    if lower.endswith(VOLUMETRIC_EXTS):
        # Write the upload and re-save through nibabel as a clean NIfTI.
        suffix = ".nii.gz" if lower.endswith(".nii.gz") else os.path.splitext(lower)[1]
        raw = os.path.join(tmpdir, "raw" + suffix)
        with open(raw, "wb") as fh:
            fh.write(file_bytes)
        img = nib.load(raw)
        data = np.asarray(img.dataobj, dtype=np.float32)
        if data.ndim == 4:  # drop a singleton time dim if present
            data = data[..., 0]
        nib.save(nib.Nifti1Image(data, img.affine if img.affine is not None else np.eye(4)), nii_path)
        is_native_volume = data.ndim == 3 and min(data.shape) > 2
        return nii_path, is_native_volume

    # 2D image -> pseudo-3D volume (stack the slice) so FAST has a 3D field.
    pil = Image.open(io.BytesIO(file_bytes)).convert("L")
    if max(pil.size) > max_side:
        scale = max_side / max(pil.size)
        pil = pil.resize((max(1, int(pil.size[0] * scale)), max(1, int(pil.size[1] * scale))))
    arr = np.asarray(pil, dtype=np.float32)
    vol = np.repeat(arr[:, :, None], depth, axis=2)
    nib.save(nib.Nifti1Image(vol, np.eye(4)), nii_path)
    return nii_path, False


def _fsl_pipeline(nii_path, tmpdir, run_segmentation=True):
    biomarkers = {}

    # 1) Brain extraction (so stats/segmentation use brain tissue only).
    brain = os.path.join(tmpdir, "brain.nii.gz")
    try:
        _run(f'bet "{nii_path}" "{brain}" -f 0.5 -g 0', timeout=240)
        target = brain
        biomarkers["brain_extraction"] = "BET"
    except Exception:
        target = nii_path  # BET can fail on thin/odd volumes; use the raw volume.
        biomarkers["brain_extraction"] = "skipped (BET unavailable for this input)"

    # 2) Basic intensity + volume stats.
    stats = _run(f'fslstats "{target}" -R -M -V -P 50 -S').split()
    if len(stats) >= 7:
        biomarkers["min_intensity"] = round(float(stats[0]), 2)
        biomarkers["max_intensity"] = round(float(stats[1]), 2)
        biomarkers["mean_intensity"] = round(float(stats[2]), 2)
        biomarkers["brain_volume_mm3"] = round(float(stats[4]), 2)
        biomarkers["median_intensity"] = round(float(stats[5]), 2)
        biomarkers["std_intensity"] = round(float(stats[6]), 2)

    # 3) FAST tissue segmentation -> CSF / GM / WM.
    if run_segmentation:
        prefix = os.path.join(tmpdir, "fast")
        _run(f'fast -t 1 -n 3 -H 0.1 -o "{prefix}" "{target}"', timeout=600)
        vols = {}
        for label, name in [(0, "csf"), (1, "grey_matter"), (2, "white_matter")]:
            pve = f"{prefix}_pve_{label}.nii.gz"
            if os.path.exists(pve):
                out = _run(f'fslstats "{pve}" -V').split()  # voxels, volume(mm3)
                if len(out) >= 2:
                    vols[name] = float(out[1])
                    biomarkers[f"{name}_volume_mm3"] = round(float(out[1]), 2)
        total = sum(vols.values())
        if total > 0:
            for name, v in vols.items():
                biomarkers[f"{name}_fraction_pct"] = round(v / total * 100, 2)
            # Atrophy-relevant ratios.
            if vols.get("white_matter"):
                biomarkers["gm_wm_ratio"] = round(vols.get("grey_matter", 0) / vols["white_matter"], 3)
            brain_tissue = vols.get("grey_matter", 0) + vols.get("white_matter", 0)
            if total:
                biomarkers["brain_parenchymal_fraction_pct"] = round(brain_tissue / total * 100, 2)

    return biomarkers


def _image_stats_fallback(file_bytes):
    arr = np.asarray(Image.open(io.BytesIO(file_bytes)).convert("L"), dtype=np.float64)
    return {
        "min_intensity": float(arr.min()),
        "max_intensity": float(arr.max()),
        "mean_intensity": round(float(arr.mean()), 2),
        "median_intensity": float(np.median(arr)),
        "std_intensity": round(float(arr.std()), 2),
        "dark_tissue_fraction_pct": round(float((arr < 64).mean()) * 100, 2),
        "note": "FSL not available — reported image-intensity statistics only.",
    }


def _format_report(biomarkers, source, filename, native_volume):
    lines = [
        "MRI Biomarker Analysis Report",
        f"Scan File: {filename}",
        f"Analysis Source: {source}",
        f"Input type: {'native 3D volume' if native_volume else '2D slice (converted to volume for segmentation)'}",
        "",
        "Biomarkers:",
    ]
    order = [
        "brain_volume_mm3", "csf_volume_mm3", "grey_matter_volume_mm3", "white_matter_volume_mm3",
        "csf_fraction_pct", "grey_matter_fraction_pct", "white_matter_fraction_pct",
        "gm_wm_ratio", "brain_parenchymal_fraction_pct",
        "mean_intensity", "median_intensity", "std_intensity", "min_intensity", "max_intensity",
    ]
    shown = set()
    for k in order:
        if k in biomarkers:
            lines.append(f"  - {k.replace('_', ' ').title()}: {biomarkers[k]}")
            shown.add(k)
    for k, v in biomarkers.items():
        if k not in shown:
            lines.append(f"  - {k.replace('_', ' ').title()}: {v}")
    lines += [
        "",
        "Interpretation guide:",
        "  - Reduced grey-matter fraction / lower GM:WM ratio and enlarged CSF fraction",
        "    are commonly associated with cortical atrophy seen in Alzheimer's disease.",
        "  - A native 3D T1 scan is required for hippocampal (FIRST) subcortical volumetry.",
        "",
        "Note: Research/education tool - not a substitute for professional diagnosis.",
    ]
    return "\n".join(lines)


def generate_report(file_bytes, filename, run_segmentation=True):
    """Return {'report': str, 'biomarkers': dict, 'source': str, 'native_volume': bool}."""
    if not fsl_available():
        biomarkers = _image_stats_fallback(file_bytes)
        return {
            "report": _format_report(biomarkers, "image-statistics (FSL unavailable)", filename, False),
            "biomarkers": biomarkers,
            "source": "image-statistics",
            "native_volume": False,
        }

    with tempfile.TemporaryDirectory() as tmp:
        try:
            nii_path, native_volume = _load_volume(file_bytes, filename, tmp)
            biomarkers = _fsl_pipeline(nii_path, tmp, run_segmentation=run_segmentation)
            source = "FSL (BET + FAST)" if run_segmentation else "FSL (BET)"
        except Exception as exc:
            biomarkers = _image_stats_fallback(file_bytes)
            biomarkers["fsl_error"] = str(exc)
            return {
                "report": _format_report(biomarkers, "image-statistics (FSL error)", filename, False),
                "biomarkers": biomarkers,
                "source": "image-statistics",
                "native_volume": False,
            }

    return {
        "report": _format_report(biomarkers, source, filename, native_volume),
        "biomarkers": biomarkers,
        "source": source,
        "native_volume": native_volume,
    }
