import { useCallback, useEffect, useRef, useState } from "react";
import { LuImagePlus, LuRotateCcw, LuScanLine, LuX } from "react-icons/lu";
import { SAMPLE_SCANS, loadSample } from "../lib/scan";
import { formatBytes } from "../lib/format";
import { cx } from "./ui";

const ACCEPT_IMG = ["image/png", "image/jpeg"];
const VOLUME_RE = /\.(nii|nii\.gz|img|hdr)$/i;
const MAX_BYTES = 25 * 1024 * 1024;

function validate(file, allowVolumes) {
  if (!file) return "No file selected.";
  if (file.size > MAX_BYTES) return `That file is ${formatBytes(file.size)} — the limit is 25 MB.`;
  if (ACCEPT_IMG.includes(file.type)) return null;
  if (allowVolumes && VOLUME_RE.test(file.name)) return null;
  return allowVolumes
    ? "Upload a PNG/JPG MRI slice or a NIfTI volume (.nii, .nii.gz)."
    : "Upload a PNG or JPG brain-MRI slice.";
}

/**
 * The single upload surface. The whole area is the click target (a real <label> for
 * the hidden input), it accepts drag-and-drop and paste, and it offers the bundled
 * OASIS sample scans so a first-time user can try the pipeline in one click.
 */
export default function Dropzone({ scan, onFile, onClear, allowVolumes = false, compact = false }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState(null);
  const [loadingSample, setLoadingSample] = useState(null);

  const take = useCallback(
    (file) => {
      const err = validate(file, allowVolumes);
      setError(err);
      if (!err) onFile(file);
    },
    [allowVolumes, onFile]
  );

  useEffect(() => {
    if (scan) return;
    const onPaste = (e) => {
      const file = [...(e.clipboardData?.files || [])][0];
      if (file) take(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [scan, take]);

  const pickSample = async (s) => {
    setLoadingSample(s.path);
    try {
      take(await loadSample(s.path, s.name));
    } finally {
      setLoadingSample(null);
    }
  };

  const accept = allowVolumes ? "image/png,image/jpeg,.nii,.gz,.img,.hdr" : "image/png,image/jpeg";
  const isVolume = scan && VOLUME_RE.test(scan.name);

  if (scan) {
    return (
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <div className="relative flex items-center justify-center bg-ink-950" style={{ height: compact ? 170 : 220 }}>
          {isVolume ? (
            <div className="flex flex-col items-center gap-2 text-white/70">
              <LuScanLine className="h-8 w-8" />
              <span className="font-mono text-xs">NIfTI volume</span>
            </div>
          ) : (
            <img src={scan.url} alt="Selected MRI scan" className="max-h-full max-w-full object-contain" />
          )}
          <span className="absolute top-3 left-3 rounded-md bg-black/50 px-2 py-1 font-mono text-[10.5px] tracking-wider text-white/80 uppercase backdrop-blur">
            Active scan
          </span>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium text-ink-900" title={scan.name}>{scan.name}</p>
            <p className="text-[12px] text-ink-500">{formatBytes(scan.size)}</p>
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900"
          >
            <LuRotateCcw className="h-3.5 w-3.5" /> Replace
          </button>
          <button aria-label="Remove scan" onClick={onClear} className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600">
            <LuX className="h-4 w-4" />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="sr-only"
            onChange={(e) => {
              take(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        {error && <p className="border-t border-ink-100 px-4 py-2 text-[12.5px] text-rose-600">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          take(e.dataTransfer.files?.[0]);
        }}
        className={cx(
          "group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition",
          compact ? "py-8" : "py-12",
          drag ? "border-brand-400 bg-brand-50" : "border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50/40"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => {
            take(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-900 text-white shadow-lg shadow-ink-900/20 transition group-hover:scale-105">
          <LuImagePlus className="h-5 w-5" />
        </span>
        <p className="mt-4 text-[15px] font-semibold text-ink-900">
          Drop an MRI slice here, or <span className="text-brand-600 underline underline-offset-4">browse</span>
        </p>
        <p className="mt-1 text-[12.5px] text-ink-500">
          {allowVolumes ? "PNG, JPG or NIfTI (.nii / .nii.gz) · up to 25 MB" : "Axial T1 slice · PNG or JPG · up to 25 MB"} · or paste
        </p>
      </label>
      {error && <p className="mt-2 text-[12.5px] text-rose-600">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-ink-500">No scan handy? Try a sample:</span>
        {SAMPLE_SCANS.map((s) => (
          <button
            key={s.path}
            onClick={() => pickSample(s)}
            disabled={!!loadingSample}
            className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white py-1 pr-3 pl-1 text-[12.5px] font-medium text-ink-700 transition hover:border-brand-300 hover:text-ink-900 disabled:opacity-60"
          >
            <img src={s.path} alt="" className="h-6 w-6 rounded-full bg-black object-cover" />
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
