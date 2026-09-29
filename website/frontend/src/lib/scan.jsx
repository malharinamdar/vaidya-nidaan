import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { ml } from "./api";

const VOLUME_RE = /\.(nii|nii\.gz|img|hdr)$/i;

// One MRI scan per patient, shared by every workspace tab: upload once, then run
// classification, Grad-CAM++, biomarkers or the full report on the same file.
// Results are cached against the scan so switching tabs never re-runs a model.
const ScanContext = createContext(null);

export function ScanProvider({ children }) {
  const [scans, setScans] = useState({}); // patientId -> { file, url, name, size, results }

  const setScan = useCallback((patientId, file) => {
    const isVolume = !!file && VOLUME_RE.test(file.name);
    setScans((prev) => {
      if (prev[patientId]?.url) URL.revokeObjectURL(prev[patientId].url);
      if (!file) {
        const next = { ...prev };
        delete next[patientId];
        return next;
      }
      return {
        ...prev,
        [patientId]: {
          file, url: URL.createObjectURL(file), name: file.name, size: file.size, results: {},
          validation: isVolume ? { status: "ok", message: "NIfTI volume" } : { status: "checking" },
        },
      };
    });
    if (!file || isVolume) return;
    // Check the upload is a brain MRI before any analysis runs.
    ml("/validate", { file })
      .then((v) => v)
      .catch((e) => ({ status: e.status === 400 ? "not_mri" : "unknown", message: e.message }))
      .then((validation) =>
        setScans((prev) =>
          prev[patientId]?.file === file ? { ...prev, [patientId]: { ...prev[patientId], validation } } : prev
        )
      );
  }, []);

  const setResult = useCallback((patientId, key, value) => {
    setScans((prev) =>
      prev[patientId]
        ? { ...prev, [patientId]: { ...prev[patientId], results: { ...prev[patientId].results, [key]: value } } }
        : prev
    );
  }, []);

  const value = useMemo(() => ({ scans, setScan, setResult }), [scans, setScan, setResult]);
  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function usePatientScan(patientId) {
  const { scans, setScan, setResult } = useContext(ScanContext);
  const scan = scans[patientId] || null;
  return {
    scan,
    setFile: (file) => setScan(patientId, file),
    clear: () => setScan(patientId, null),
    setResult: (key, value) => setResult(patientId, key, value),
  };
}

/** Load one of the bundled sample scans (public/samples) as a File. */
export async function loadSample(path, name) {
  const res = await fetch(path);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}

// Slices from two held-out test patients (not seen in training), at the same brain level.
export const SAMPLE_SCANS = [
  { path: "/samples/oasis1_test_OAS1_0031_128.jpg", name: "OAS1_0031_MR1_mpr-1_128.jpg", label: "Demented (OASIS-1 test set)",
    title: "OAS1_0031, mild dementia (CDR 1), held-out test patient" },
  { path: "/samples/oasis1_test_OAS1_0177_128.jpg", name: "OAS1_0177_MR1_mpr-1_128.jpg", label: "Non-demented (OASIS-1 test set)",
    title: "OAS1_0177, non-demented, held-out test patient" },
];
