import { createContext, useCallback, useContext, useMemo, useState } from "react";

// One MRI scan per patient, shared by every workspace tab: upload once, then run
// classification, Grad-CAM++, biomarkers or the full report on the same file.
// Results are cached against the scan so switching tabs never re-runs a model.
const ScanContext = createContext(null);

export function ScanProvider({ children }) {
  const [scans, setScans] = useState({}); // patientId -> { file, url, name, size, results }

  const setScan = useCallback((patientId, file) => {
    setScans((prev) => {
      if (prev[patientId]?.url) URL.revokeObjectURL(prev[patientId].url);
      if (!file) {
        const next = { ...prev };
        delete next[patientId];
        return next;
      }
      return {
        ...prev,
        [patientId]: { file, url: URL.createObjectURL(file), name: file.name, size: file.size, results: {} },
      };
    });
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

export const SAMPLE_SCANS = [
  { path: "/samples/axial_demented_sample.jpg", name: "oasis_axial_demented.jpg", label: "Demented (OASIS-1)" },
  { path: "/samples/axial_nondemented_sample.jpg", name: "oasis_axial_nondemented.jpg", label: "Non-demented (OASIS-1)" },
];
