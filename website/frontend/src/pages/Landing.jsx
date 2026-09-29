import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LuArrowRight, LuArrowUpRight, LuBookOpen, LuBrain, LuEye, LuFileText, LuGithub, LuLanguages,
  LuLayers, LuScanLine, LuSparkles, LuUpload,
} from "react-icons/lu";
import Logo from "../components/Logo";
import ModelCard from "../components/ModelCard";
import { useAuth } from "../lib/auth";
import { cx, useToast } from "../components/ui";

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] },
});

function useDemo() {
  const { startDemo, token } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (token) return navigate("/dashboard");
    setBusy(true);
    try {
      await startDemo();
      navigate("/dashboard");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return [go, busy];
}

function HeadlineChip({ icon: Icon, children, tone }) {
  return (
    <span
      className={cx(
        "mx-1 inline-flex -translate-y-[0.08em] items-center gap-2 rounded-2xl px-3 py-0.5 align-middle font-display text-[0.82em] italic shadow-sm ring-1 backdrop-blur-md",
        tone === "mint" ? "bg-brand-50/80 text-brand-700 ring-brand-200/80" : "bg-violet-50/80 text-violet-700 ring-violet-200/80"
      )}
    >
      <span className={cx("inline-flex h-[0.95em] w-[0.95em] items-center justify-center rounded-lg not-italic", tone === "mint" ? "bg-brand-500 text-white" : "bg-violet-500 text-white")}>
        <Icon className="h-[0.6em] w-[0.6em]" />
      </span>
      {children}
    </span>
  );
}

function Nav({ onDemo, busy }) {
  const { token } = useAuth();
  return (
    <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <nav className="flex w-full max-w-5xl items-center justify-between gap-4 rounded-full border border-white/70 bg-white/70 py-2 pr-2 pl-4 shadow-[0_8px_32px_-12px_rgb(11_20_55/0.25)] backdrop-blur-xl">
        <Link to="/" aria-label="Vaidya Nidaan home">
          <Logo size="sm" />
        </Link>
        <div className="hidden items-center gap-1 text-[13.5px] font-medium text-ink-600 md:flex">
          {[["Platform", "#platform"], ["How it works", "#how"], ["Model card", "#model"]].map(([l, h]) => (
            <a key={h} href={h} className="rounded-full px-3.5 py-1.5 transition hover:bg-ink-900/5 hover:text-ink-900">
              {l}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {!token && (
            <Link to="/login" className="hidden rounded-full px-4 py-2 text-[13.5px] font-medium text-ink-700 transition hover:bg-ink-900/5 sm:inline-flex">
              Sign in
            </Link>
          )}
          <button
            onClick={onDemo}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13.5px] font-medium text-white transition hover:bg-ink-800 disabled:opacity-70"
          >
            {token ? "Open workspace" : busy ? "Opening…" : "Try the demo"}
            <LuArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </nav>
    </div>
  );
}

/** A faithful miniature of the report view, built from a real model output. */
function ProductMockup() {
  return (
    <div className="relative mx-auto w-full max-w-5xl">
      <div className="absolute -inset-x-10 -top-10 -bottom-6 -z-10 rounded-[48px] bg-white/30 blur-2xl" />
      <div className="overflow-hidden rounded-[22px] border border-white/80 bg-white/80 shadow-[0_40px_120px_-40px_rgb(11_20_55/0.45)] ring-1 ring-ink-900/5 backdrop-blur-xl">
        <div className="flex items-center gap-2 border-b border-ink-100 bg-white/70 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-brand-300" />
          <span className="ml-3 hidden rounded-full bg-ink-100 px-3 py-1 font-mono text-[10.5px] text-ink-500 sm:inline">vaidya-nidaan / reports / VN-3F9A2C</span>
        </div>
        <div className="grid gap-0 md:grid-cols-[180px_1fr]">
          <aside className="hidden border-r border-ink-100 bg-ink-50/60 p-4 md:block">
            <Logo size="sm" className="origin-left scale-[0.85]" />
            <div className="mt-6 space-y-1 text-[12px]">
              {["Patients", "AI Assistant", "Reports"].map((l, i) => (
                <div key={l} className={cx("rounded-lg px-2.5 py-1.5", i === 0 ? "bg-white font-medium text-ink-900 shadow-sm ring-1 ring-ink-100" : "text-ink-500")}>
                  {l}
                </div>
              ))}
            </div>
          </aside>
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="label-eyebrow">Diagnosis report · OASIS-1 test patient</p>
                <p className="mt-1 font-display text-[30px] leading-none text-ink-900">Sunita Rao, 74</p>
              </div>
              <span className="rounded-full bg-rose-50 px-3 py-1 text-[12px] font-medium text-rose-700 ring-1 ring-rose-200">Dementia pattern · 78.4%</span>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
              <div className="relative flex aspect-[2/1] items-center justify-center overflow-hidden rounded-xl bg-ink-950">
                <div className="relative h-full">
                  <img src="/hero/mri_v2.png" alt="Axial MRI slice from the OASIS-1 dataset" className="h-full w-auto object-contain" />
                  <img src="/hero/heatmap_v2.png" alt="" className="absolute inset-0 h-full w-full object-contain opacity-75 mix-blend-screen" />
                </div>
                <span className="absolute bottom-2 left-2 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[9.5px] tracking-wider text-white/80 uppercase">
                  Grad-CAM++ · block5_conv4
                </span>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="mb-1.5 flex justify-between text-[11.5px] text-ink-500">
                    <span>Tissue composition (single slice)</span>
                    <span className="font-mono">FSL FAST</span>
                  </div>
                  <div className="flex h-6 overflow-hidden rounded-lg text-[10px] font-semibold">
                    <div className="flex w-[34%] items-center justify-center bg-sky-400 text-white">CSF</div>
                    <div className="flex w-[33%] items-center justify-center bg-brand-500 text-white">GM</div>
                    <div className="flex w-[33%] items-center justify-center bg-ink-200 text-ink-800">WM</div>
                  </div>
                </div>
                <div className="rounded-xl bg-ink-50 p-3.5 text-[12px] leading-relaxed text-ink-600 ring-1 ring-ink-100">
                  <p className="mb-1 text-[10.5px] font-semibold tracking-wide text-ink-900 uppercase">Clinical rationale</p>
                  The classifier's output should be weighed against the single-slice tissue estimate, which reflects one level of the
                  brain only <sup className="rounded bg-brand-50 px-1 font-mono text-[9px] text-brand-800 ring-1 ring-brand-200">1</sup>. Confirm with
                  volumetric imaging <sup className="rounded bg-brand-50 px-1 font-mono text-[9px] text-brand-800 ring-1 ring-brand-200">2</sup>…
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniMeter() {
  return (
    <div className="mt-6 space-y-2.5">
      {[["Non Demented", 21.6, "bg-brand-500"], ["Demented", 78.4, "bg-rose-500"]].map(([l, v, c]) => (
        <div key={l}>
          <div className="mb-1 flex justify-between text-[11.5px] text-ink-500">
            <span>{l}</span>
            <span className="font-mono text-ink-800">{v.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
            <div className={`h-full rounded-full ${c}`} style={{ width: `${v}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
function MiniHeat() {
  return (
    <div className="mt-6 flex h-24 items-center justify-center overflow-hidden rounded-xl bg-ink-950">
      <div className="relative h-full">
        <img src="/hero/mri_v2.png" alt="" className="h-full w-auto" />
        <img src="/hero/heatmap_v2.png" alt="" className="absolute inset-0 h-full w-full opacity-80 mix-blend-screen" />
      </div>
    </div>
  );
}
function MiniTissue() {
  return (
    <div className="mt-6 flex h-5 overflow-hidden rounded-md">
      <div className="w-[22%] bg-sky-400" />
      <div className="w-[51%] bg-brand-500" />
      <div className="w-[27%] bg-ink-200" />
    </div>
  );
}
function MiniCites() {
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      {[
        "Characterizing the MRI signature of hippocampal sclerosis of aging · 2026",
        "Relationships of CSF biomarkers to cortical atrophy in early-onset Alzheimer's disease · 2026",
        "Longitudinal surface-based morphometry changes in the hippocampus in dementia · 2026",
      ].map((t, i) => (
        <span key={t} className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-ink-200 bg-white py-0.5 pr-2.5 pl-0.5 text-[11.5px] text-ink-600">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand-50 font-mono text-[9.5px] font-semibold text-brand-800">{i + 1}</span>
          {t}
        </span>
      ))}
    </div>
  );
}
function MiniLangs() {
  return (
    <div className="mt-6 flex flex-wrap gap-1.5">
      {["English", "हिन्दी", "मराठी", "தமிழ்", "বাংলা", "ગુજરાતી"].map((l) => (
        <span key={l} className="rounded-full bg-ink-100 px-2.5 py-0.5 text-[12px] text-ink-700">{l}</span>
      ))}
    </div>
  );
}
function MiniReport() {
  return (
    <div className="mt-6 grid grid-cols-3 gap-2 md:mt-0">
      {["Impression", "Grad-CAM++", "Rationale"].map((l, i) => (
        <div key={l} className="rounded-xl border border-ink-200 bg-white p-2.5 shadow-sm">
          <p className="font-mono text-[9px] tracking-wider text-ink-400 uppercase">0{i + 1}</p>
          <p className="mt-1 text-[11.5px] font-medium text-ink-800">{l}</p>
          <div className="mt-2 space-y-1">
            <div className="h-1 w-full rounded bg-ink-100" />
            <div className="h-1 w-2/3 rounded bg-ink-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

const FEATURES = [
  { icon: LuBrain, title: "Slice classification", body: "Transfer-learned VGG-19 separates demented from non-demented patterns on an axial T1 slice and reports both class probabilities.", span: "md:col-span-2", visual: MiniMeter },
  { icon: LuEye, title: "Grad-CAM++ you can fade", body: "See which regions drove the decision, then blend the attribution over the anatomy.", visual: MiniHeat },
  { icon: LuLayers, title: "FSL tissue biomarkers", body: "BET brain extraction and FAST segmentation estimate CSF, grey and white matter — partial-volume weighted.", visual: MiniTissue },
  { icon: LuBookOpen, title: "Grounded rationale", body: "GPT-4o writes the clinical reasoning with PubMed/MEDLINE abstracts retrieved from a 513-paper index, cited inline.", span: "md:col-span-2", visual: MiniCites },
  { icon: LuLanguages, title: "Multilingual assistant", body: "Ask follow-ups in English, Hindi, Marathi or any regional language — with conversation memory and citations.", visual: MiniLangs },
  { icon: LuFileText, title: "Printable reports", body: "Every run is saved to the patient's history as a clean A4 report you can print or save as PDF.", span: "md:col-span-2", visual: MiniReport, row: true },
];

const STEPS = [
  { icon: LuUpload, title: "Upload once", body: "Drop an axial MRI slice into the patient workspace — every tool reuses it." },
  { icon: LuScanLine, title: "Classify & explain", body: "The classifier scores the slice; Grad-CAM++ shows the evidence behind the score." },
  { icon: LuLayers, title: "Measure tissue", body: "FSL segments the slice into CSF, grey and white matter fractions." },
  { icon: LuSparkles, title: "Grounded report", body: "Findings, literature and a hedged rationale come together in one document." },
];

export default function Landing() {
  const [demo, busy] = useDemo();
  return (
    <div className="min-h-screen overflow-x-hidden bg-ink-50 text-ink-900">
      <Nav onDemo={demo} busy={busy} />

      {/* ---------------------------------------------------------------- Hero */}
      <header className="relative isolate pt-36 pb-20 sm:pt-44">
        <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[1050px] bg-[url('/art/hero-glass.webp')] bg-cover bg-center" />
        <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[1050px] bg-gradient-to-b from-transparent via-transparent to-ink-50" />

        <div className="mx-auto max-w-5xl px-5 text-center">
          <motion.span
            {...fade(0)}
            className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/60 px-3.5 py-1.5 text-[12.5px] font-medium text-ink-700 shadow-sm backdrop-blur-md"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 shadow-[0_0_0_3px_rgb(24_168_134/0.2)]" />
            Explainable AI for Alzheimer's neuroimaging
          </motion.span>

          <motion.h1 {...fade(0.08)} className="mt-7 font-display text-[44px] leading-[1.02] tracking-[-0.01em] text-ink-900 sm:text-[72px] lg:text-[84px]">
            Turn one <HeadlineChip icon={LuScanLine} tone="mint">MRI slice</HeadlineChip>
            <br className="hidden sm:block" /> into a report you can <HeadlineChip icon={LuEye} tone="violet">audit</HeadlineChip>
          </motion.h1>

          <motion.p {...fade(0.16)} className="mx-auto mt-7 max-w-2xl text-[16.5px] leading-relaxed text-ink-600 sm:text-[18px]">
            Vaidya Nidaan classifies a brain MRI slice, shows what the model looked at, measures tissue composition with FSL, and
            drafts a PubMed-grounded rationale — in one document a clinician can check.
          </motion.p>

          <motion.div {...fade(0.24)} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              onClick={demo}
              disabled={busy}
              className="group inline-flex h-12 items-center gap-2 rounded-full bg-brand-500 px-6 text-[15px] font-semibold text-white shadow-[0_10px_30px_-8px_rgb(13_136_109/0.6)] transition hover:bg-brand-600 disabled:opacity-70"
            >
              {busy ? "Opening demo…" : "Try the live demo"}
              <LuArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
            <Link
              to="/signup"
              className="inline-flex h-12 items-center gap-2 rounded-full border border-white/80 bg-white/70 px-6 text-[15px] font-medium text-ink-800 shadow-sm backdrop-blur-md transition hover:bg-white"
            >
              Create an account <LuArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
          <motion.p {...fade(0.3)} className="mt-4 text-[12.5px] text-ink-500">
            No sign-up needed · opens a demo workspace with sample patients
          </motion.p>
        </div>

        <motion.div {...fade(0.35)} className="mt-16 px-4 sm:mt-20">
          <ProductMockup />
        </motion.div>
      </header>

      {/* ---------------------------------------------------------------- Built on */}
      <section className="mx-auto max-w-5xl px-5 pb-6">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 font-mono text-[12px] tracking-[0.14em] text-ink-400 uppercase">
          {["TensorFlow", "FSL · FMRIB", "PubMed / MEDLINE", "ChromaDB", "GPT-4o", "MongoDB"].map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- Features */}
      <section id="platform" className="mx-auto max-w-6xl scroll-mt-28 px-5 py-24">
        <motion.div {...fade()} className="max-w-2xl">
          <p className="label-eyebrow">The platform</p>
          <h2 className="mt-3 font-display text-[40px] leading-[1.05] text-ink-900 sm:text-[52px]">
            One scan, <span className="text-ink-400 italic">four lenses.</span>
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-600">
            A prediction alone isn't useful to a clinician. Each lens answers a different question: what did the model decide, why,
            what does the tissue look like, and what does the literature say.
          </p>
        </motion.div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              {...fade(i * 0.05)}
              className={cx(
                "group relative overflow-hidden rounded-3xl border border-ink-200/70 bg-white p-7 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]",
                f.span
              )}
            >
              <div aria-hidden className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-gradient-to-br from-brand-100 to-sky-100 opacity-0 blur-2xl transition duration-500 group-hover:opacity-100" />
              <div className={cx("relative", f.row && "md:grid md:grid-cols-2 md:items-center md:gap-8")}>
                <div>
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ink-900 text-white">
                    <f.icon className="h-[18px] w-[18px]" />
                  </span>
                  <h3 className="mt-5 text-[17px] font-semibold text-ink-900">{f.title}</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-ink-600">{f.body}</p>
                </div>
                {f.visual && <f.visual />}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- Dark band */}
      <section className="relative isolate overflow-hidden bg-ink-950 py-24 text-white sm:py-32">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[url('/art/glass-dark.webp')] bg-cover bg-center opacity-60" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-ink-950 via-ink-950/80 to-transparent" />
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-2">
          <motion.div {...fade()}>
            <p className="font-mono text-[11px] tracking-[0.16em] text-brand-300 uppercase">Explainability</p>
            <h2 className="mt-4 font-display text-[42px] leading-[1.04] sm:text-[56px]">
              Evidence you can audit, <span className="text-white/50 italic">not just admire.</span>
            </h2>
            <p className="mt-6 max-w-lg text-[16px] leading-relaxed text-white/70">
              Every prediction ships with its evidence: a Grad-CAM++ map of the regions that drove the decision, FSL tissue
              measurements, and a rationale that cites the literature it draws on.
            </p>
            <div className="mt-10 grid max-w-md grid-cols-3 gap-6">
              {[["86,437", "OASIS-1 slices"], ["0.89", "patient-level test AUC"], ["513", "PubMed abstracts"]].map(([n, l]) => (
                <div key={l}>
                  <p className="font-display text-[34px] leading-none">{n}</p>
                  <p className="mt-2 text-[12.5px] text-white/50">{l}</p>
                </div>
              ))}
            </div>
          </motion.div>
          <motion.div {...fade(0.1)} className="relative mx-auto w-full max-w-[420px]">
            <div aria-hidden className="absolute inset-8 rounded-full bg-brand-400/20 blur-3xl" />
            <img src="/art/brain-dots.png" alt="Dot-matrix rendering of an axial brain MRI slice" className="relative w-full" />
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:radial-gradient(ellipse_at_center,black_55%,transparent_75%)]">
              <div className="animate-scan h-1/3 w-full bg-gradient-to-b from-transparent via-brand-300/25 to-transparent" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- How it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-28 px-5 py-24">
        <motion.div {...fade()} className="text-center">
          <p className="label-eyebrow">How it works</p>
          <h2 className="mt-3 font-display text-[40px] leading-[1.05] sm:text-[52px]">From upload to report</h2>
        </motion.div>
        <div className="relative mt-14 grid gap-6 md:grid-cols-4">
          <div aria-hidden className="absolute top-6 right-[12%] left-[12%] hidden h-px bg-gradient-to-r from-transparent via-ink-300 to-transparent md:block" />
          {STEPS.map((s, i) => (
            <motion.div key={s.title} {...fade(i * 0.08)} className="relative text-center">
              <span className="relative mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-ink-200 bg-white text-ink-900 shadow-sm">
                <s.icon className="h-5 w-5" />
                <span className="absolute -top-2 -right-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink-900 font-mono text-[10px] text-white">
                  {i + 1}
                </span>
              </span>
              <h3 className="mt-5 text-[15.5px] font-semibold">{s.title}</h3>
              <p className="mx-auto mt-2 max-w-[240px] text-[14px] leading-relaxed text-ink-600">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- Model card */}
      <section id="model" className="mx-auto max-w-6xl scroll-mt-28 px-5 pb-24">
        <motion.div {...fade()} className="rounded-[32px] border border-ink-200/70 bg-white p-7 shadow-[var(--shadow-card)] sm:p-12">
          <div className="max-w-2xl">
            <p className="label-eyebrow">Model card</p>
            <h2 className="mt-3 font-display text-[36px] leading-[1.05] sm:text-[46px]">What's under the hood</h2>
            <p className="mt-4 text-[15.5px] leading-relaxed text-ink-600">
              The data, models and retrieval stack behind every report.
            </p>
          </div>
          <div className="mt-10">
            <ModelCard />
          </div>
        </motion.div>
      </section>

      {/* ---------------------------------------------------------------- CTA */}
      <section className="px-4 pb-10">
        <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-[36px] px-6 py-20 text-center">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[url('/art/hero-glass.webp')] bg-cover bg-center" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-white/20" />
          <h2 className="font-display text-[40px] leading-[1.05] text-ink-900 sm:text-[56px]">See it on a real scan.</h2>
          <p className="mx-auto mt-4 max-w-lg text-[16px] text-ink-700">
            Open the demo workspace, pick a sample OASIS slice, and generate a full report in under a minute.
          </p>
          <button
            onClick={demo}
            disabled={busy}
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-ink-900 px-7 text-[15px] font-semibold text-white shadow-xl shadow-ink-900/20 transition hover:bg-ink-800 disabled:opacity-70"
          >
            {busy ? "Opening demo…" : "Try the live demo"} <LuArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-5 pt-10 pb-12">
        <div className="flex flex-col gap-8 border-t border-ink-200 pt-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-4 text-[13.5px] leading-relaxed text-ink-500">
              "Vaidya Nidaan" is Sanskrit for medical diagnosis. Built by Team MarkerMinds — 3rd place of 400+ teams at PICT
              Techfiesta 2025.
            </p>
          </div>
          <div className="flex flex-col gap-3 text-[13.5px] text-ink-600">
            <a href="https://github.com/malharinamdar/vaidya-nidaan" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-ink-900">
              <LuGithub className="h-4 w-4" /> Source on GitHub
            </a>
            <a href="#model" className="hover:text-ink-900">Model card & limitations</a>
            <Link to="/login" className="hover:text-ink-900">Clinician sign in</Link>
          </div>
        </div>
        <p className="mt-10 text-[12px] text-ink-400">
          For research and education. Not a medical device. © {new Date().getFullYear()} Vaidya Nidaan.
        </p>
      </footer>
    </div>
  );
}
