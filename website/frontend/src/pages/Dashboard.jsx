import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  LuArrowRight, LuChevronRight, LuFileText, LuPlus, LuSearch, LuTrash2, LuTriangleAlert, LuUsers, LuClock,
} from "react-icons/lu";
import { Alert, Badge, Button, ConfirmDialog, EmptyState, Skeleton, cx, useToast } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, initials, isDemented, shortId, timeAgo } from "../lib/format";

const AVATAR_GRADIENTS = [
  "from-brand-200 to-sky-200", "from-violet-200 to-sky-100", "from-amber-100 to-rose-200",
  "from-sky-200 to-brand-100", "from-rose-100 to-violet-200", "from-lime-100 to-brand-200",
];
const gradientFor = (name = "") => AVATAR_GRADIENTS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_GRADIENTS.length];

export function Avatar({ name, className = "h-10 w-10 text-[13px]" }) {
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-ink-800 ring-2 ring-white", gradientFor(name), className)}>
      {initials(name)}
    </span>
  );
}

export function ResultBadge({ result }) {
  if (!result?.label) return <Badge tone="neutral">Not analysed</Badge>;
  const dem = isDemented(result.label);
  return (
    <Badge tone={dem ? "danger" : "brand"} dot>
      {dem ? "Dementia pattern" : "No dementia pattern"}
      <span className="font-mono opacity-70">{result.probability?.toFixed(0)}%</span>
    </Badge>
  );
}

// Greeting by the viewer's local time. Each slot has a few lines; the pick changes daily
// (stable within a day, so it doesn't flicker between visits).
const GREETINGS = [
  [4, [ // midnight - 4 am
    (n) => `Burning the midnight oil, ${n}?`,
    (n) => `Still up, ${n}?`,
    (n) => `Late-night rounds, ${n}?`,
    (n) => `The night shift, ${n}.`,
    (n) => `Neurons never sleep, ${n}.`,
  ]],
  [6, [ // 4 - 6 am
    (n) => `Up before the sun, ${n}?`,
    (n) => `An early start, ${n}.`,
    (n) => `Dawn patrol, ${n}?`,
    (n) => `The early bird gets the scans, ${n}.`,
  ]],
  [12, [ // 6 am - noon
    (n) => `Good morning, ${n}`,
    (n) => `Morning rounds, ${n}?`,
    (n) => `Rise and scan, ${n}.`,
    (n) => `Coffee first, ${n}?`,
    (n) => `Bright and early, ${n}.`,
  ]],
  [17, [ // noon - 5 pm
    (n) => `Good afternoon, ${n}`,
    (n) => `Post-lunch rounds, ${n}?`,
    (n) => `Chai break, ${n}?`,
    (n) => `Afternoon, ${n}. Back at it?`,
    (n) => `Halfway there, ${n}.`,
  ]],
  [21, [ // 5 - 9 pm
    (n) => `Good evening, ${n}`,
    (n) => `Evening rounds, ${n}?`,
    (n) => `One last scan, ${n}?`,
    (n) => `Winding down, ${n}?`,
  ]],
  [24, [ // 9 pm - midnight
    (n) => `Working late, ${n}?`,
    (n) => `Night owl mode, ${n}?`,
    (n) => `Quiet hours, ${n}.`,
    (n) => `One more report, ${n}?`,
  ]],
];
function greeting(name, now = new Date()) {
  const h = now.getHours();
  const day = Math.floor((now.getTime() - now.getTimezoneOffset() * 60_000) / 86_400_000);
  const [, lines] = GREETINGS.find(([until]) => h < until);
  return lines[day % lines.length](name);
}

function StatCard({ label, value, icon: Icon, hint, tone = "ink" }) {
  return (
    <div className="card relative overflow-hidden p-5">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] font-medium text-ink-500">{label}</p>
        <span className={cx("inline-flex h-8 w-8 items-center justify-center rounded-lg", tone === "rose" ? "bg-rose-50 text-rose-600" : tone === "brand" ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-600")}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 font-display text-[42px] leading-none text-ink-900">{value}</p>
      {hint && <p className="mt-2 text-[12px] text-ink-500">{hint}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { doctor } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [patients, setPatients] = useState(null);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, r] = await Promise.all([api("/api/patients"), api("/api/reports?limit=6")]);
      setPatients(p.patients);
      setReports(r.reports);
    } catch (e) {
      setError(e.message);
      setPatients([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => (patients || []).filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())),
    [patients, query]
  );
  const stats = useMemo(() => {
    const list = patients || [];
    return {
      total: list.length,
      reports: list.reduce((a, p) => a + (p.reportCount || 0), 0),
      flagged: list.filter((p) => isDemented(p.latestResult?.label)).length,
      pending: list.filter((p) => !p.latestResult?.label).length,
    };
  }, [patients]);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await api(`/api/patients/${toDelete.id}`, { method: "DELETE" });
      setPatients((ps) => ps.filter((p) => p.id !== toDelete.id));
      toast(`${toDelete.name} removed`);
      setToDelete(null);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setDeleting(false);
    }
  };

  const loading = patients === null;
  const first = doctor?.name?.replace(/^Dr\.?\s*/i, "").split(" ")[0];

  return (
    <div className="animate-fade-up">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label-eyebrow">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="mt-2 font-display text-[44px] leading-none text-ink-900 sm:text-[52px]">
            {greeting(doctor?.isDemo ? "Doctor" : `Dr. ${first || ""}`.trim())}
          </h1>
          <p className="mt-3 text-[15px] text-ink-500">Your patients, their latest scans, and what the models found.</p>
        </div>
        <Button to="/patients/new" icon={LuPlus} className="rounded-full">
          New patient
        </Button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Patients" value={loading ? "–" : stats.total} icon={LuUsers} hint="in this workspace" />
        <StatCard label="Reports generated" value={loading ? "–" : stats.reports} icon={LuFileText} tone="brand" hint="saved to patient history" />
        <StatCard label="Dementia pattern" value={loading ? "–" : stats.flagged} icon={LuTriangleAlert} tone="rose" hint="on the latest scan" />
        <StatCard label="Awaiting a scan" value={loading ? "–" : stats.pending} icon={LuClock} hint="no report yet" />
      </div>

      {error && (
        <Alert className="mt-6" onRetry={load}>
          {error}
        </Alert>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_320px]">
        <section className="card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-ink-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[15px] font-semibold text-ink-900">
              Patients <span className="ml-1 font-mono text-[12px] font-normal text-ink-400">{filtered.length}</span>
            </h2>
            <label className="relative block sm:w-72">
              <LuSearch className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search patients"
                className="h-9 w-full rounded-full border border-ink-200 bg-ink-50/60 pr-3 pl-9 text-[13.5px] placeholder:text-ink-400 focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100 focus:outline-none"
              />
            </label>
          </div>

          {loading ? (
            <div className="divide-y divide-ink-100">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-6 w-32 rounded-full" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={LuUsers}
              title={patients.length ? "No patients match your search" : "No patients yet"}
              action={!patients.length && <Button to="/patients/new" icon={LuPlus}>Add your first patient</Button>}
            >
              {patients.length ? "Try a different name." : "Create a patient record, then upload an MRI slice in their workspace."}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-ink-100">
              {filtered.map((p) => (
                <li key={p.id} className="group flex items-center gap-4 px-5 py-3.5 transition hover:bg-ink-50/70">
                  <Link to={`/patients/${p.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                    <Avatar name={p.name} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-[14.5px] font-semibold text-ink-900">
                        {p.name}
                        {p.latestResult?.label && (
                          <span
                            title={p.latestResult.label}
                            className={cx("h-2 w-2 shrink-0 rounded-full sm:hidden", isDemented(p.latestResult.label) ? "bg-rose-500" : "bg-brand-500")}
                          />
                        )}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-500">
                        <span>{p.age} y · {p.gender}</span>
                        <span className="text-ink-300">•</span>
                        <span className="font-mono text-[11.5px]">{shortId(p.id)}</span>
                        {p.smoker === "Yes" && <span className="rounded-md bg-ink-100 px-1.5 text-[11px] text-ink-600">Smoker</span>}
                        {p.neurologicalCondition === "Yes" && <span className="rounded-md bg-ink-100 px-1.5 text-[11px] text-ink-600">Neuro history</span>}
                      </p>
                    </div>
                    <div className="hidden flex-col items-end gap-1 sm:flex">
                      <ResultBadge result={p.latestResult} />
                      <span className="text-[11.5px] text-ink-400">
                        {p.latestResult?.analyzedAt ? `Analysed ${timeAgo(p.latestResult.analyzedAt)}` : `Added ${formatDate(p.createdAt)}`}
                      </span>
                    </div>
                  </Link>
                  <button
                    aria-label={`Delete ${p.name}`}
                    onClick={() => setToDelete(p)}
                    className="rounded-lg p-2 text-ink-300 opacity-0 transition group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 focus:opacity-100"
                  >
                    <LuTrash2 className="h-4 w-4" />
                  </button>
                  <LuChevronRight className="hidden h-4 w-4 text-ink-300 sm:block" />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="card h-fit overflow-hidden">
          <div className="border-b border-ink-100 px-5 py-4">
            <h2 className="text-[15px] font-semibold text-ink-900">Recent reports</h2>
          </div>
          {reports.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-ink-500">Reports you generate will appear here.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {reports.map((r) => (
                <li key={r.id}>
                  <button onClick={() => navigate(`/reports/${r.id}`)} className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-ink-50">
                    <span className={cx("h-2 w-2 shrink-0 rounded-full", isDemented(r.prediction?.label) ? "bg-rose-500" : "bg-brand-500")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink-900">{r.patientSnapshot?.name}</span>
                      <span className="block text-[12px] text-ink-500">
                        {r.prediction?.label} · {r.prediction?.probability?.toFixed(0)}% · {timeAgo(r.createdAt)}
                      </span>
                    </span>
                    <LuArrowRight className="h-3.5 w-3.5 text-ink-300" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.name}?`}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
      >
        This permanently removes the patient and all {toDelete?.reportCount || 0} of their saved reports.
      </ConfirmDialog>
    </div>
  );
}
