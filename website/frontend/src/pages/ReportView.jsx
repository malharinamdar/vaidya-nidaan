import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LuArrowLeft, LuDownload, LuPrinter, LuTrash2 } from "react-icons/lu";
import Logo from "../components/Logo";
import {
  BiomarkerTable, ClassBars, HeatmapViewer, References, RationaleText, TissueComposition, VerdictCard,
} from "../components/results";
import { Alert, Button, ConfirmDialog, Skeleton, useToast } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDateTime, shortId } from "../lib/format";

function Section({ n, title, children, note }) {
  return (
    <section className="border-t border-ink-100 pt-8">
      <div className="keep-with-next mb-5 flex items-baseline gap-4">
        <span className="font-mono text-[12px] text-brand-600">{String(n).padStart(2, "0")}</span>
        <div className="flex-1">
          <h2 className="font-display text-[28px] leading-none text-ink-900">{title}</h2>
          {note && <p className="mt-1.5 text-[12.5px] text-ink-500">{note}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Meta({ label, value, mono }) {
  return (
    <div>
      <dt className="font-mono text-[10px] tracking-[0.14em] text-ink-400 uppercase">{label}</dt>
      <dd className={`mt-1 text-[14px] font-medium text-ink-900 ${mono ? "font-mono text-[13px]" : ""}`}>{value || "—"}</dd>
    </div>
  );
}

export default function ReportView() {
  const { reportId } = useParams();
  const { doctor } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api(`/api/reports/${reportId}`)
      .then((r) => setReport(r.report))
      .catch((e) => setError(e.message));
  }, [reportId]);

  useEffect(() => {
    if (report) document.title = `Report ${shortId(report.id)} · ${report.patientSnapshot?.name} · Vaidya Nidaan`;
    return () => {
      document.title = "Vaidya Nidaan · Explainable Alzheimer's MRI screening";
    };
  }, [report]);

  const downloadText = () => {
    const blob = new Blob([report.reportText || ""], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vaidya-nidaan_${(report.patientSnapshot?.name || "report").replace(/\s+/g, "_")}_${shortId(report.id)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api(`/api/reports/${reportId}`, { method: "DELETE" });
      toast("Report deleted");
      navigate(`/patients/${report.patient}`);
    } catch (e) {
      toast(e.message, "error");
      setDeleting(false);
    }
  };

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-20">
        <Alert>{error}</Alert>
        <Button to="/dashboard" variant="secondary" icon={LuArrowLeft} className="mt-4">Back to patients</Button>
      </div>
    );
  }

  const p = report?.patientSnapshot || {};
  const pred = report?.prediction;
  const gc = report?.gradcam || {};

  return (
    <div className="min-h-screen bg-ink-100/70 pb-16 print:bg-white print:pb-0">
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-20 border-b border-ink-200/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[900px] items-center justify-between gap-3 px-4 py-3">
          <Link
            to={report ? `/patients/${report.patient}` : "/dashboard"}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-600 hover:text-ink-900"
          >
            <LuArrowLeft className="h-3.5 w-3.5" /> {p.name || "Back"}
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" icon={LuTrash2} onClick={() => setConfirm(true)} disabled={!report}>
              <span className="hidden sm:inline">Delete</span>
            </Button>
            <Button variant="secondary" size="sm" icon={LuDownload} onClick={downloadText} disabled={!report}>
              <span className="hidden sm:inline">Text</span>
            </Button>
            <Button size="sm" icon={LuPrinter} onClick={() => window.print()} disabled={!report} className="rounded-full">
              Print / Save PDF
            </Button>
          </div>
        </div>
      </div>

      <article className="print-sheet mx-auto mt-8 max-w-[900px] rounded-[28px] bg-white px-6 py-8 shadow-[var(--shadow-lift)] sm:px-12 sm:py-12">
        {!report ? (
          <div className="space-y-6">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        ) : (
          <>
            {/* Letterhead */}
            <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <Logo size="lg" />
              <div className="sm:text-right">
                <p className="font-mono text-[10.5px] tracking-[0.16em] text-ink-400 uppercase">Neuroimaging decision-support report</p>
                <p className="mt-1 font-mono text-[13px] text-ink-900">{shortId(report.id)}</p>
                <p className="text-[12.5px] text-ink-500">{formatDateTime(report.createdAt)}</p>
              </div>
            </header>
            <div className="mt-6 h-1 rounded-full bg-gradient-to-r from-brand-300 via-sky-300 to-violet-300" />

            {/* Patient block */}
            <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              <Meta label="Patient" value={p.name} />
              <Meta label="Age / sex" value={p.age != null ? `${p.age} y · ${p.gender}` : "—"} />
              <Meta label="Patient ID" value={shortId(report.patient)} mono />
              <Meta label="Clinician" value={doctor?.name} />
              <Meta label="Scan" value={report.scanName || "MRI slice"} />
              <Meta label="Smoker" value={p.smoker} />
              <Meta label="Alcohol" value={p.alcoholConsumption} />
              <Meta label="Neurological history" value={p.neurologicalCondition} />
            </dl>

            {/* Impression */}
            <div className="avoid-break mt-8">
              <VerdictCard label={pred.label} probability={pred.probability} size="lg" />
            </div>

            <div className="mt-10 space-y-10">
              <Section n={1} title="Classification" note="VGG-19 transfer-learning classifier · trained on OASIS-1">
                <div className="grid gap-6 sm:grid-cols-2">
                  <ClassBars perClass={pred.perClass} />
                  <dl className="grid grid-cols-2 gap-4 text-[13px]">
                    <div>
                      <dt className="text-ink-500">Decision</dt>
                      <dd className="mt-0.5 font-medium text-ink-900">{pred.label}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-500">Threshold</dt>
                      <dd className="mt-0.5 font-medium text-ink-900">P(Demented) ≥ 50%</dd>
                    </div>
                    <div>
                      <dt className="text-ink-500">Input</dt>
                      <dd className="mt-0.5 font-medium text-ink-900">Axial slice, 128 × 128</dd>
                    </div>
                    <div>
                      <dt className="text-ink-500">Backbone</dt>
                      <dd className="mt-0.5 font-medium text-ink-900">VGG-19 (ImageNet)</dd>
                    </div>
                  </dl>
                </div>
              </Section>

              <Section n={2} title="Explainability" note={`Grad-CAM++ on ${gc.layer || "block5_conv4"}`}>
                <div className="print:hidden">
                  <HeatmapViewer original={gc.original} heatmap={gc.heatmap} overlay={gc.overlay} tissuePct={gc.tissueAttributionPct} layer={gc.layer} />
                </div>
                <div className="hidden print:block">
                  <HeatmapViewer original={gc.original} overlay={gc.overlay} tissuePct={gc.tissueAttributionPct} layer={gc.layer} printMode />
                </div>
              </Section>

              <Section n={3} title="Tissue biomarkers" note="FSL BET brain extraction + FAST tissue segmentation">
                <TissueComposition biomarkers={report.biomarkers} source={report.biomarkerSource} nativeVolume={report.nativeVolume} />
                <div className="avoid-break mt-6">
                  <p className="label-eyebrow mb-3">All measurements</p>
                  <BiomarkerTable biomarkers={report.biomarkers} />
                </div>
              </Section>

              <Section n={4} title="Clinical rationale" note="GPT-4o, grounded in the findings above and retrieved literature">
                <div className="rounded-2xl bg-ink-50/70 p-6 ring-1 ring-ink-100">
                  <RationaleText text={report.rationale} />
                </div>
              </Section>

              {report.literature?.length > 0 && (
                <Section n={5} title="Related literature" note="Retrieved from PubMed/MEDLINE">
                  <References items={report.literature} />
                </Section>
              )}
            </div>

            {/* Sign-off */}
            <footer className="avoid-break mt-12 border-t border-ink-100 pt-8">
              <div className="grid gap-8 sm:grid-cols-2">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.14em] text-ink-400 uppercase">Reviewed by</p>
                  <div className="mt-8 border-b border-ink-300" />
                  <p className="mt-2 text-[12px] text-ink-500">Name, signature</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] tracking-[0.14em] text-ink-400 uppercase">Date</p>
                  <div className="mt-8 border-b border-ink-300" />
                  <p className="mt-2 text-[12px] text-ink-500">DD / MM / YYYY</p>
                </div>
              </div>
              <p className="mt-8 text-center text-[11.5px] text-ink-500">
                AI-generated decision-support report for research and education — to be reviewed by a qualified clinician.
              </p>
              <p className="mt-2 text-center font-mono text-[10.5px] text-ink-400">
                Vaidya Nidaan · classifier {report.classifierBackend || "tensorflow"} · report {shortId(report.id)}
              </p>
            </footer>
          </>
        )}
      </article>

      <ConfirmDialog open={confirm} title="Delete this report?" onClose={() => setConfirm(false)} onConfirm={remove} loading={deleting}>
        The report will be removed from {p.name}'s history. This can't be undone.
      </ConfirmDialog>
    </div>
  );
}
