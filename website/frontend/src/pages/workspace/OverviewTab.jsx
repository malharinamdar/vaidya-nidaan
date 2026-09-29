import { LuBrain, LuEye, LuFileText, LuLayers } from "react-icons/lu";
import { VerdictCard } from "../../components/results";
import { Button } from "../../components/ui";
import { formatDate, formatDateTime } from "../../lib/format";
import { ReportHistory } from "./ReportTab";
import { TabHeader } from "./common";

const TOOLS = [
  { id: "classify", icon: LuBrain, title: "Classify", body: "Demented vs non-demented score" },
  { id: "gradcam", icon: LuEye, title: "Explain", body: "Grad-CAM++ attribution map" },
  { id: "biomarkers", icon: LuLayers, title: "Measure", body: "FSL tissue composition" },
  { id: "report", icon: LuFileText, title: "Report", body: "Everything, saved as a PDF-ready report" },
];

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-[12px] text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-[14px] font-medium text-ink-900">{value || "—"}</dd>
    </div>
  );
}

export default function OverviewTab({ patient, scan, go, reports }) {
  const latest = patient.latestResult;
  return (
    <div className="space-y-8">
      <TabHeader title="Overview" description="Latest findings, saved reports and the patient's risk profile." />

      {latest?.label ? (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="label-eyebrow">Latest saved report · {formatDateTime(latest.analyzedAt)}</p>
            {latest.report && (
              <Button to={`/reports/${latest.report}`} variant="ghost" size="sm">
                Open report
              </Button>
            )}
          </div>
          <VerdictCard label={latest.label} probability={latest.probability} />
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50/50 p-6">
          <p className="text-[15px] font-semibold text-ink-900">No reports yet</p>
          <p className="mt-1 text-[13.5px] text-ink-500">
            {scan ? "Your scan is loaded — run any tool below, or generate the full report." : "Start by uploading an MRI slice in the scan panel."}
          </p>
        </div>
      )}

      <div>
        <p className="label-eyebrow mb-3">Tools</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => go(t.id)}
              className="group rounded-2xl border border-ink-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-[var(--shadow-card)]"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-ink-100 text-ink-700 transition group-hover:bg-ink-900 group-hover:text-white">
                <t.icon className="h-4 w-4" />
              </span>
              <p className="mt-3 text-[14px] font-semibold text-ink-900">{t.title}</p>
              <p className="mt-0.5 text-[12.5px] text-ink-500">{t.body}</p>
            </button>
          ))}
        </div>
      </div>

      {reports?.length > 0 && (
        <div>
          <p className="label-eyebrow mb-3">Report history</p>
          <ReportHistory reports={reports} compact />
        </div>
      )}

      <div>
        <p className="label-eyebrow mb-3">Patient details</p>
        <dl className="grid grid-cols-2 gap-5 rounded-2xl border border-ink-200 p-5 sm:grid-cols-3">
          <Detail label="Age" value={`${patient.age} years`} />
          <Detail label="Sex" value={patient.gender} />
          <Detail label="Smoker" value={patient.smoker} />
          <Detail label="Alcohol" value={patient.alcoholConsumption} />
          <Detail label="Neurological history" value={patient.neurologicalCondition} />
          <Detail label="Record created" value={formatDate(patient.createdAt)} />
        </dl>
      </div>
    </div>
  );
}
