import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  LuArrowLeft, LuBot, LuBrain, LuEye, LuFileText, LuLayers, LuLayoutDashboard, LuPencil, LuSparkles, LuTrash2,
} from "react-icons/lu";
import Dropzone from "../components/Dropzone";
import PatientForm from "../components/PatientForm";
import { Alert, Badge, Button, Card, ConfirmDialog, Modal, Skeleton, Tabs, useToast } from "../components/ui";
import { Avatar, ResultBadge } from "./Dashboard";
import OverviewTab from "./workspace/OverviewTab";
import ClassifyTab from "./workspace/ClassifyTab";
import GradCamTab from "./workspace/GradCamTab";
import BiomarkersTab from "./workspace/BiomarkersTab";
import ReportTab from "./workspace/ReportTab";
import ChatPanel from "../components/ChatPanel";
import { api } from "../lib/api";
import { usePatientScan } from "../lib/scan";
import { formatDate, shortId } from "../lib/format";

const TABS = [
  { id: "overview", label: "Overview", icon: LuLayoutDashboard },
  { id: "classify", label: "Classification", icon: LuBrain },
  { id: "gradcam", label: "Grad-CAM++", icon: LuEye },
  { id: "biomarkers", label: "Biomarkers", icon: LuLayers },
  { id: "report", label: "Full report", icon: LuFileText },
  { id: "assistant", label: "Assistant", icon: LuBot },
];

function patientContext(patient, results) {
  const lines = [
    `Patient: ${patient.name}, ${patient.age} y, ${patient.gender}.`,
    `Risk factors: smoker ${patient.smoker || "unknown"}, alcohol ${patient.alcoholConsumption || "unknown"}, neurological history ${patient.neurologicalCondition || "unknown"}.`,
  ];
  if (patient.notes) lines.push(`Clinical notes: ${patient.notes}`);
  if (patient.latestResult?.label)
    lines.push(`Latest saved report: ${patient.latestResult.label}, model P(Demented) ${patient.latestResult.probability}% (${formatDate(patient.latestResult.analyzedAt)}).`);
  if (results?.classify) lines.push(`Current scan classification: ${results.classify.prediction} (P(Demented) ${results.classify.alzheimer_probability}%; Demented at >= ${results.classify.threshold ?? 50}%).`);
  if (results?.biomarkers?.biomarkers) {
    const b = results.biomarkers.biomarkers;
    lines.push(`Current scan single-slice tissue composition: CSF ${b.csf_fraction_pct}%, GM ${b.grey_matter_fraction_pct}%, WM ${b.white_matter_fraction_pct}%, GM:WM ${b.gm_wm_ratio}.`);
  }
  return lines.join("\n");
}

export default function PatientWorkspace() {
  const { id, tab: tabParam } = useParams();
  const tab = TABS.some((t) => t.id === tabParam) ? tabParam : "overview";
  const navigate = useNavigate();
  const toast = useToast();
  const { scan, setFile, clear, setResult } = usePatientScan(id);
  const [patient, setPatient] = useState(null);
  const [reports, setReports] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, r] = await Promise.all([api(`/api/patients/${id}`), api(`/api/patients/${id}/reports`)]);
      setPatient(p.patient);
      setReports(r.reports);
    } catch (e) {
      setError(e.message);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const go = (t) => navigate(`/patients/${id}${t === "overview" ? "" : `/${t}`}`);

  const save = async (data) => {
    const res = await api(`/api/patients/${id}`, { method: "PUT", body: data });
    setPatient(res.patient);
    setEditing(false);
    toast("Patient updated");
  };
  const remove = async () => {
    setDeleting(true);
    try {
      await api(`/api/patients/${id}`, { method: "DELETE" });
      clear();
      toast(`${patient.name} removed`);
      navigate("/dashboard");
    } catch (e) {
      toast(e.message, "error");
      setDeleting(false);
    }
  };

  if (error && !patient) {
    return (
      <div className="mx-auto max-w-lg pt-10">
        <Alert onRetry={load}>{error}</Alert>
        <Button to="/dashboard" variant="secondary" icon={LuArrowLeft} className="mt-4">
          Back to patients
        </Button>
      </div>
    );
  }
  if (!patient) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-24" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  const tabProps = { patient, scan, setResult, go, reports, reload: load };
  const riskChips = [
    patient.smoker === "Yes" && "Smoker",
    patient.alcoholConsumption === "High" && "High alcohol",
    patient.neurologicalCondition === "Yes" && "Neurological history",
  ].filter(Boolean);

  return (
    <div className="animate-fade-up">
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 hover:text-ink-900">
        <LuArrowLeft className="h-3.5 w-3.5" /> Patients
      </Link>

      {/* Patient header */}
      <div className="mt-4 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={patient.name} className="h-16 w-16 text-[18px]" />
          <div>
            <h1 className="font-display text-[40px] leading-none text-ink-900 sm:text-[46px]">{patient.name}</h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-500">
              <span>{patient.age} years · {patient.gender}</span>
              <span className="text-ink-300">•</span>
              <span className="font-mono text-[12px]">{shortId(patient.id)}</span>
              <ResultBadge result={patient.latestResult} />
              {riskChips.map((c) => (
                <Badge key={c} tone="neutral">{c}</Badge>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={LuPencil} onClick={() => setEditing(true)} className="rounded-full">
            Edit
          </Button>
          <Button variant="danger" icon={LuTrash2} onClick={() => setConfirmDelete(true)} className="rounded-full">
            Delete
          </Button>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Scan column */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[14px] font-semibold text-ink-900">MRI scan</p>
              {scan &&
                (scan.validation?.status === "not_mri" ? (
                  <Badge tone="danger" dot>Not an MRI</Badge>
                ) : scan.validation?.status === "checking" ? (
                  <Badge tone="neutral" dot>Checking</Badge>
                ) : (
                  <Badge tone="brand" dot>Ready</Badge>
                ))}
            </div>
            <Dropzone scan={scan} onFile={setFile} onClear={clear} allowVolumes compact />
            <p className="mt-3 text-[12px] leading-relaxed text-ink-500">
              Upload once — every tab reuses this scan. Classification and Grad-CAM++ need an axial PNG/JPG slice; biomarkers also accept a
              3D NIfTI.
            </p>
            <Button
              variant="brand"
              icon={LuSparkles}
              className="mt-4 w-full rounded-full"
              disabled={!scan || ["not_mri", "checking"].includes(scan.validation?.status)}
              onClick={() => go("report")}
            >
              Generate full report
            </Button>
          </Card>
          {patient.notes && (
            <Card className="p-4">
              <p className="label-eyebrow">Clinical notes</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-700">{patient.notes}</p>
            </Card>
          )}
        </div>

        {/* Tools */}
        <Card className="min-w-0 overflow-hidden">
          <div className="border-b border-ink-100 px-3">
            <Tabs tabs={TABS} active={tab} onChange={go} />
          </div>
          {tab === "assistant" ? (
            <ChatPanel
              key={patient.id}
              patientId={patient.id}
              patientName={patient.name}
              context={patientContext(patient, scan?.results)}
              title={`Ask about ${patient.name.split(" ")[0]}`}
              subtitle="The assistant sees this patient's details and the findings from the current scan, and cites PubMed where relevant."
              suggestions={[
                "Summarise this patient's findings in plain language",
                "What follow-up imaging would you consider next?",
                "Explain the GM:WM ratio result for this scan",
                "इस मरीज़ के परिणाम सरल भाषा में समझाइए",
              ]}
              className="h-[calc(100vh-260px)] min-h-[600px]"
            />
          ) : (
            <div className="p-5 sm:p-7">
              {tab === "overview" && <OverviewTab {...tabProps} />}
              {tab === "classify" && <ClassifyTab {...tabProps} />}
              {tab === "gradcam" && <GradCamTab {...tabProps} />}
              {tab === "biomarkers" && <BiomarkersTab {...tabProps} />}
              {tab === "report" && <ReportTab {...tabProps} />}
            </div>
          )}
        </Card>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit patient" size="lg">
        <PatientForm initial={patient} onSubmit={save} onCancel={() => setEditing(false)} submitLabel="Save changes" />
      </Modal>
      <ConfirmDialog open={confirmDelete} title={`Delete ${patient.name}?`} onClose={() => setConfirmDelete(false)} onConfirm={remove} loading={deleting}>
        This permanently removes the patient and all of their saved reports.
      </ConfirmDialog>
    </div>
  );
}
