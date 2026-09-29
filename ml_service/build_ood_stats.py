"""Fit the MRI input check: a Mahalanobis out-of-distribution detector in VGG-19 feature space.

Features = global-average-pooled `block4_pool` activations (512-d) with ImageNet preprocessing.
block1-4 are frozen ImageNet layers in both the v1 model and the v2 notebook (which fine-tunes
block5 only), so the same statistics serve either model.

The detector is fitted on OASIS-1 axial slices from ~70% of subjects and its threshold is
calibrated on slices from the remaining, unseen subjects. Output: ml_service/ood_stats.npz.

Usage (from ml_service/):
    .venv/bin/python build_ood_stats.py --data ~/.cache/kagglehub/datasets/vedjosh/alzheimer-mri/versions/1
"""
import argparse
import os
import re

import numpy as np

import inference

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "ood_stats.npz")


def list_slices(root):
    by_subject = {}
    for folder, _, files in os.walk(root):
        for f in files:
            m = re.match(r"(OAS1_\d+)", f)
            if m and f.lower().endswith((".jpg", ".jpeg", ".png")):
                by_subject.setdefault(m.group(1), []).append(os.path.join(folder, f))
    return {s: sorted(v) for s, v in by_subject.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--fit-per-subject", type=int, default=8)
    ap.add_argument("--cal-per-subject", type=int, default=4)
    ap.add_argument("--quantile", type=float, default=0.995)
    ap.add_argument("--margin", type=float, default=1.15)
    ap.add_argument("--reject-ratio", type=float, default=1.75,
                    help="hard-reject limit = threshold x ratio (atypical-but-MRI uploads fall in between)")
    args = ap.parse_args()

    rng = np.random.default_rng(0)
    subjects = list_slices(os.path.expanduser(args.data))
    names = sorted(subjects)
    rng.shuffle(names)
    n_fit = int(0.7 * len(names))

    def pick(subs, k):
        out = []
        for s in subs:
            files = subjects[s]
            idx = np.linspace(0, len(files) - 1, min(k, len(files))).astype(int)  # spread across slice levels
            out += [files[i] for i in idx]
        return out

    fit_files, cal_files = pick(names[:n_fit], args.fit_per_subject), pick(names[n_fit:], args.cal_per_subject)
    print(f"{len(names)} subjects -> fit {len(fit_files)} slices ({n_fit} subjects), "
          f"calibrate {len(cal_files)} slices ({len(names) - n_fit} unseen subjects)")

    def feats(files):
        out = []
        for i in range(0, len(files), 64):
            out.append(inference.ood_features([open(p, "rb").read() for p in files[i:i + 64]]))
            print(f"  {min(i + 64, len(files))}/{len(files)}", end="\r", flush=True)
        print()
        return np.concatenate(out)

    F = feats(fit_files)
    mean = F.mean(0)
    cov = np.cov(F - mean, rowvar=False)
    shrink = 0.1  # shrink toward a scaled identity for a stable inverse
    cov = (1 - shrink) * cov + shrink * np.trace(cov) / cov.shape[0] * np.eye(cov.shape[0])
    precision = np.linalg.inv(cov)

    def dist(X):
        d = X - mean
        return np.sqrt(np.einsum("ij,jk,ik->i", d, precision, d))

    d_fit, d_cal = dist(F), dist(feats(cal_files))
    threshold = float(np.quantile(d_cal, args.quantile) * args.margin)
    print(f"fit distances  p50 {np.median(d_fit):.1f}  p99 {np.quantile(d_fit, .99):.1f}")
    print(f"unseen-subject p50 {np.median(d_cal):.1f}  p99.5 {np.quantile(d_cal, args.quantile):.1f}  max {d_cal.max():.1f}")
    print(f"threshold = {threshold:.1f}")
    np.savez_compressed(OUT, mean=mean.astype(np.float32), precision=precision.astype(np.float32),
                        threshold=np.float32(threshold), reject_threshold=np.float32(round(threshold * args.reject_ratio, 1)),
                        layer="block4_pool", preprocess="vgg19",
                        n_fit=len(fit_files), n_cal=len(cal_files))
    print("saved", OUT)


if __name__ == "__main__":
    main()
