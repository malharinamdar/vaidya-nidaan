import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LuArrowRight, LuFileText, LuSparkles } from "react-icons/lu";
import { Analysing } from "../../components/results";
import { Button, useToast } from "../../components/ui";
import { api, ml } from "../../lib/api";
import { formatDateTime, isDemented } from "../../lib/format";
import { ErrorBox, NeedScan, TabHeader, isVolume, isNotMRI } from "./common";

const STEPS = [
  "Classifying the slice with VGG-19",
  "Computing Grad-CAM++ attribution",
  "Segmenting tissue with FSL BET + FAST",
  "Retrieving PubMed/MEDLINE literature",
  "Drafting the clinical rationale (GPT-4o)",
  "Saving the report to the patient record",
];

export function ReportHistory({ reports, compact = false }) {
  const navigate = useNavigate();
  if (!reports?.length) return null;
  return (
    <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200">
      {(compact ? reports.slice(0, 4) : reports).map((r) => (
        <li key={r.id}>
          <button onClick={() => navigate(`/reports/${r.id}`)} className="flex w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-ink-50">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-600">
              <LuFileText className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium text-ink-900">{formatDateTime(r.createdAt)}</span>
              <span className="block truncate text-[12px] text-ink-500">{r.scanName || "MRI slice"}</span>
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ring-1 ${isDemented(r.prediction?.label) ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-brand-50 text-brand-800 ring-brand-200"}`}>
              {r.prediction?.label} · {r.prediction?.probability?.toFixed(0)}%
            </span>
            <LuArrowRight className="h-4 w-4 text-ink-300" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function ReportTab({ patient, scan, reports }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const volume = isVolume(scan);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await ml(`/api/patients/${patient.id}/diagnosis`, {
        file: scan.file,
        patient: {
          name: patient.name,
          age: patient.age,
          sex: patient.gender,
          smoker: patient.smoker,
          alcohol: patient.alcoholConsumption,
          neurological_history: patient.neurologicalCondition,
          clinical_notes: patient.notes || undefined,
        },
      });
      const saved = await api(`/api/patients/${patient.id}/reports`, {
        method: "POST",
        body: { ...result, scanName: scan.name },
      });
      toast("Report saved to the patient record");
      navigate(`/reports/${saved.report.id}`);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div>
      <TabHeader
        title="Full diagnosis report"
        description="Runs every analysis on the current scan, grounds the rationale in retrieved literature, and saves a printable report to this patient's history."
      />
      <ErrorBox error={error} onRetry={generate} />
      {!scan || volume || isNotMRI(scan) ? (
        <NeedScan volumeNotSupported={volume} notMRI={isNotMRI(scan)} />
      ) : loading ? (
        <div className="py-4">
          <Analysing image={scan.url} steps={STEPS} />
          <p className="mt-6 text-center text-[12.5px] text-ink-500">This usually takes 20–60 seconds.</p>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-3xl bg-ink-950 p-7 text-white sm:p-9">
          <div aria-hidden className="absolute inset-0 bg-[url('/art/glass-dark.webp')] bg-cover bg-center opacity-70" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
            <img src={scan.url} alt="" className="h-28 w-28 rounded-2xl bg-black object-contain ring-1 ring-white/20" />
            <div className="flex-1">
              <p className="font-mono text-[11px] tracking-[0.14em] text-brand-300 uppercase">Ready</p>
              <p className="mt-1 font-display text-[30px] leading-tight">Generate {patient.name.split(" ")[0]}'s report</p>
              <p className="mt-1 text-[13px] text-white/60">Classification · Grad-CAM++ · FSL tissue · PubMed-grounded rationale</p>
            </div>
            <Button variant="light" size="lg" icon={LuSparkles} onClick={generate} className="rounded-full">
              Generate report
            </Button>
          </div>
        </div>
      )}

      {reports?.length > 0 && (
        <div className="mt-8">
          <p className="label-eyebrow mb-3">Previous reports</p>
          <ReportHistory reports={reports} />
        </div>
      )}
    </div>
  );
}
