#!/usr/bin/env python3
import subprocess
import os
import sys

def run_command(cmd):
    """Run a shell command and return its stdout as a string.
       Prints error messages if the command fails."""
    print("Running command:", cmd)
    result = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, universal_newlines=True)
    if result.returncode != 0:
        print("Error running command:")
        print("STDERR:", result.stderr)
        sys.exit(result.returncode)
    return result.stdout.strip()

def main(input_file):
    # If the input file is in .img format, convert it to .nii.gz using FSL's fslchfiletype.
    # (If your file is already NIfTI, this step is skipped.)
    if input_file.endswith('.img'):
        nii_file = input_file.replace('.img', '.nii.gz')
        print(f"Converting {input_file} to {nii_file}")
        convert_cmd = f"fslchfiletype NIFTI_GZ {input_file} {nii_file}"
        run_command(convert_cmd)
    else:
        nii_file = input_file

    # -------------------------
    # Step 1: Brain Extraction (BET)
    # -------------------------
    brain_extracted = "brain_extracted.nii.gz"
    bet_cmd = f"bet {nii_file} {brain_extracted} -f 0.5 -g 0"
    run_command(bet_cmd)

    # -------------------------
    # Step 2: Basic Statistics using fslstats
    # -------------------------
    # We use:
    #   -R : minimum and maximum intensity,
    #   -M : mean intensity,
    #   -V : voxel count and total volume (mm³),
    #   -P 50 : median intensity,
    #   -S : standard deviation.
    stats_cmd = f"fslstats {brain_extracted} -R -M -V -P 50 -S"
    stats_output = run_command(stats_cmd)
    # Expecting 7 numbers: min, max, mean, voxel_count, volume, median, std
    stats_vals = stats_output.split()
    if len(stats_vals) != 7:
        print("Unexpected fslstats output:", stats_vals)
        sys.exit(1)
    min_int, max_int, mean_int, voxels, brain_vol, median_int, std_int = stats_vals

    # -------------------------
    # Step 3: Tissue Segmentation using FAST
    # -------------------------
    fast_prefix = "fast_output"
    fast_cmd = f"fast -t 1 -n 3 -H 0.1 -o {fast_prefix} {brain_extracted}"
    run_command(fast_cmd)
    # FAST produces probability maps:
    csf_file = f"{fast_prefix}_pve_0.nii.gz"  # CSF
    gm_file  = f"{fast_prefix}_pve_1.nii.gz"  # Gray Matter
    wm_file  = f"{fast_prefix}_pve_2.nii.gz"  # White Matter

    # Extract tissue volumes using fslstats (each output gives voxel count and volume)
    csf_out = run_command(f"fslstats {csf_file} -V")
    gm_out  = run_command(f"fslstats {gm_file} -V")
    wm_out  = run_command(f"fslstats {wm_file} -V")
    csf_vox, csf_vol = csf_out.split()
    gm_vox, gm_vol = gm_out.split()
    wm_vox, wm_vol = wm_out.split()

    # -------------------------
    # Step 4: Registration to MNI152 space using FLIRT
    # -------------------------
    mni_file = "brain_mni.nii.gz"
    mni_mat  = "brain2mni.mat"
    # Reference brain: adjust path if necessary (FSLDIR should be set in your environment)
    ref_file = os.path.join(os.environ.get("FSLDIR", "/usr/local/fsl"), "data/standard/MNI152_T1_1mm_brain.nii.gz")
    flirt_cmd = f"flirt -in {brain_extracted} -ref {ref_file} -omat {mni_mat} -out {mni_file}"
    run_command(flirt_cmd)

    # -------------------------
    # Step 5: Subcortical Segmentation using FIRST
    # -------------------------
    first_prefix = "first_output"
    first_cmd = f"run_first_all -i {mni_file} -o {first_prefix}"
    run_command(first_cmd)
    # FIRST produces a segmentation file. Here we assume it is named as follows:
    first_seg_file = f"{first_prefix}_all_fast_firstseg.nii.gz"

    # -------------------------
    # Step 6: Extract Hippocampal Volumes using fslmaths and fslstats
    # -------------------------
    # We assume (commonly) that:
    #   Left Hippocampus label = 17
    #   Right Hippocampus label = 53
    # Adjust these values if your FIRST output uses different labels.
    left_hippo_file  = "left_hippocampus.nii.gz"
    right_hippo_file = "right_hippocampus.nii.gz"
    run_command(f"fslmaths {first_seg_file} -thr 17 -uthr 17 {left_hippo_file}")
    run_command(f"fslmaths {first_seg_file} -thr 53 -uthr 53 {right_hippo_file}")
    left_hippo_stats  = run_command(f"fslstats {left_hippo_file} -V")
    right_hippo_stats = run_command(f"fslstats {right_hippo_file} -V")
    try:
        left_vox, left_vol = left_hippo_stats.split()
    except ValueError:
        left_vox, left_vol = "0", "0"
    try:
        right_vox, right_vol = right_hippo_stats.split()
    except ValueError:
        right_vox, right_vol = "0", "0"

    # -------------------------
    # Step 7: Compile and Write the Advanced Medical Report
    # -------------------------
    report = f"""
Advanced MRI Analysis Report
------------------------------
Input File: {input_file}

Basic Statistics (Brain-Extracted Image):
  - Minimum Intensity: {min_int}
  - Maximum Intensity: {max_int}
  - Mean Intensity: {mean_int}
  - Brain Volume: {brain_vol} mm³ (from {voxels} voxels)
  - Median Intensity: {median_int}
  - Standard Deviation: {std_int}

Tissue Segmentation (FAST):
  - CSF Volume: {csf_vol} mm³ (from {csf_vox} voxels)
  - Gray Matter Volume: {gm_vol} mm³ (from {gm_vox} voxels)
  - White Matter Volume: {wm_vol} mm³ (from {wm_vox} voxels)

Subcortical Segmentation (FIRST):
  - Left Hippocampus Volume: {left_vol} mm³ (from {left_vox} voxels)
  - Right Hippocampus Volume: {right_vol} mm³ (from {right_vox} voxels)

Note: Volumes are based on voxel counts multiplied by voxel dimensions as stored in image headers.
"""
    report_file = "advanced_mri_report.txt"
    with open(report_file, "w") as f:
        f.write(report)

    print(f"\nAdvanced MRI analysis complete. Report saved to {report_file}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python advanced_mri_analysis.py <input_file>")
        print("  <input_file> can be a .img or .nii.gz file.")
        sys.exit(1)
    input_file = sys.argv[1]
    main(input_file)
