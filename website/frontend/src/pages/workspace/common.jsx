import { useState } from "react";
import { LuImagePlus, LuPlay, LuRotateCcw } from "react-icons/lu";
import { Alert, Button } from "../../components/ui";
import { ResultPlaceholder } from "../../components/results";

const VOLUME_RE = /\.(nii|nii\.gz|img|hdr)$/i;
export const isVolume = (scan) => !!scan && VOLUME_RE.test(scan.name);

/** Run an ML call against the current scan and cache its result on the scan. */
export function useRun(scan, setResult, key, fn) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const result = scan?.results?.[key] || null;
  const run = async () => {
    if (!scan) return;
    setLoading(true);
    setError(null);
    try {
      setResult(key, await fn(scan.file));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  return { result, loading, error, run };
}

export function TabHeader({ title, description, action }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="font-display text-[30px] leading-none text-ink-900">{title}</h2>
        {description && <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function RunButton({ onClick, loading, hasResult, label }) {
  return (
    <Button onClick={onClick} loading={loading} icon={hasResult ? LuRotateCcw : LuPlay} variant={hasResult ? "secondary" : "primary"} className="rounded-full">
      {loading ? "Analysing…" : hasResult ? "Run again" : label}
    </Button>
  );
}

export function NeedScan({ volumeNotSupported }) {
  return (
    <ResultPlaceholder icon={LuImagePlus} title={volumeNotSupported ? "This tool needs a 2D slice" : "Upload a scan to begin"}>
      {volumeNotSupported
        ? "Classification and Grad-CAM++ run on an axial PNG/JPG slice. Replace the NIfTI volume in the scan panel, or use Biomarkers."
        : "Drop an MRI slice into the scan panel (or pick a sample OASIS scan). Every tab reuses it."}
    </ResultPlaceholder>
  );
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <Alert className="mb-5" onRetry={onRetry} title="Analysis failed">
      {error}
    </Alert>
  );
}
