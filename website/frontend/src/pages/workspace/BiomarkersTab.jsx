import { useState } from "react";
import { LuChevronDown } from "react-icons/lu";
import { Analysing, BiomarkerTable, TissueComposition } from "../../components/results";
import { ml } from "../../lib/api";
import { cx } from "../../components/ui";
import { ErrorBox, NeedScan, RunButton, TabHeader, useRun } from "./common";

export default function BiomarkersTab({ scan, setResult }) {
  const { result, loading, error, run } = useRun(scan, setResult, "biomarkers", (file) => ml("/report", { file }));
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div>
      <TabHeader
        title="Tissue biomarkers"
        description="FSL BET extracts the brain, then FAST segments it into CSF, grey matter and white matter."
        action={scan && <RunButton onClick={run} loading={loading} hasResult={!!result} label="Run FSL analysis" />}
      />
      <ErrorBox error={error} onRetry={run} />
      {!scan ? (
        <NeedScan />
      ) : loading ? (
        <Analysing image={scan.url} steps={["Converting the upload to NIfTI", "BET brain extraction", "FAST 3-class tissue segmentation", "Partial-volume weighted fractions"]} />
      ) : result ? (
        <div className="space-y-7">
          <TissueComposition biomarkers={result.biomarkers} source={result.source} nativeVolume={result.native_volume} />
          <div>
            <p className="label-eyebrow mb-3">All measurements</p>
            <BiomarkerTable biomarkers={result.biomarkers} />
          </div>
          {result.biomarkers?.fsl_error && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900 ring-1 ring-amber-200">
              FSL could not process this input ({result.biomarkers.fsl_error.slice(0, 160)}); image statistics are shown instead.
            </p>
          )}
          <div className="rounded-2xl border border-ink-200">
            <button onClick={() => setShowRaw((v) => !v)} className="flex w-full items-center justify-between px-5 py-3.5 text-[13.5px] font-medium text-ink-700">
              Plain-text FSL report
              <LuChevronDown className={cx("h-4 w-4 transition", showRaw && "rotate-180")} />
            </button>
            {showRaw && (
              <pre className="overflow-x-auto border-t border-ink-100 bg-ink-50/60 px-5 py-4 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-700">
                {result.report}
              </pre>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6 rounded-2xl bg-ink-50/60 p-8 sm:flex-row">
          <img src={scan.url} alt="" className="h-32 w-32 rounded-xl bg-black object-contain" />
          <div>
            <p className="text-[15px] font-semibold text-ink-900">Segment {scan.name}</p>
            <p className="mt-1 text-[13px] text-ink-500">FSL takes around 5–20 seconds.</p>
            <div className="mt-4">
              <RunButton onClick={run} loading={loading} label="Run FSL analysis" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
