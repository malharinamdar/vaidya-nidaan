import { useState } from "react";
import { motion } from "framer-motion";
import { LuArrowUpRight, LuBrain, LuCircleCheck, LuTriangleAlert } from "react-icons/lu";
import { BIOMARKER_LABELS, TISSUE, isDemented, signalStrength } from "../lib/format";
import { Badge, cx } from "./ui";

// ------------------------------------------------------------------ Verdict
export function VerdictCard({ label, probability, className, size = "md" }) {
  const dem = isDemented(label);
  const strength = signalStrength(probability);
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-2xl p-5 ring-1",
        dem ? "bg-gradient-to-br from-rose-50 to-white ring-rose-200" : "bg-gradient-to-br from-brand-50 to-white ring-brand-200",
        className
      )}
    >
      <div className="flex items-start gap-4">
        <span
          className={cx(
            "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-lg",
            dem ? "bg-rose-600 shadow-rose-600/25" : "bg-brand-500 shadow-brand-600/25"
          )}
        >
          {dem ? <LuTriangleAlert className="h-5 w-5" /> : <LuCircleCheck className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="label-eyebrow">Model impression</p>
          <p className={cx("mt-1 font-display leading-none text-ink-900", size === "lg" ? "text-[40px]" : "text-[32px]")}>
            {dem ? "Dementia pattern" : "No dementia pattern"}
          </p>
          <p className="mt-2 text-[13.5px] text-ink-600">
            Class <span className="font-semibold text-ink-900">{label}</span> · {strength.toLowerCase()} confidence
          </p>
        </div>
        <div className="text-right">
          <p className="label-eyebrow">P(Demented)</p>
          <p className="mt-1 font-mono text-[28px] font-medium tracking-tight text-ink-900 tabular-nums">
            {probability.toFixed(1)}
            <span className="text-base text-ink-400">%</span>
          </p>
        </div>
      </div>
      <ProbabilityMeter value={probability} className="mt-5" />
    </div>
  );
}

// ------------------------------------------------------------------ Meter
export function ProbabilityMeter({ value, className }) {
  return (
    <div className={className}>
      <div className="relative h-2.5 rounded-full bg-gradient-to-r from-brand-200 via-amber-100 to-rose-200">
        <div className="absolute top-1/2 left-1/2 h-4 w-px -translate-y-1/2 bg-ink-400" />
        <motion.div
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-ink-900 shadow-md"
          initial={{ left: "50%" }}
          animate={{ left: `${Math.min(Math.max(value, 1), 99)}%` }}
          transition={{ type: "spring", damping: 20, stiffness: 120 }}
        />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10.5px] tracking-wide text-ink-500 uppercase">
        <span>Non-demented</span>
        <span>50% threshold</span>
        <span>Demented</span>
      </div>
    </div>
  );
}

export function ClassBars({ perClass }) {
  return (
    <div className="space-y-3">
      {Object.entries(perClass || {}).map(([cls, p]) => (
        <div key={cls}>
          <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
            <span className="font-medium text-ink-700">{cls}</span>
            <span className="font-mono text-ink-900 tabular-nums">{Number(p).toFixed(2)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-100">
            <motion.div
              className={cx("h-full rounded-full", isDemented(cls) ? "bg-rose-500" : "bg-brand-500")}
              initial={{ width: 0 }}
              animate={{ width: `${p}%` }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Grad-CAM
export function JetLegend({ className }) {
  return (
    <div className={cx("flex items-center gap-3", className)}>
      <span className="font-mono text-[10.5px] tracking-wide text-ink-500 uppercase">Low</span>
      <div className="jet-bar h-2 flex-1 rounded-full" />
      <span className="font-mono text-[10.5px] tracking-wide text-ink-500 uppercase">High attribution</span>
    </div>
  );
}

/**
 * Original scan with the transparent Grad-CAM++ layer on top; an opacity slider lets
 * the clinician fade the attribution in and out against the anatomy.
 */
export function HeatmapViewer({ original, heatmap, overlay, tissuePct, layer, printMode = false }) {
  const [opacity, setOpacity] = useState(0.7);
  const [mode, setMode] = useState("overlay"); // overlay | side
  const canBlend = !!heatmap;

  const Frame = ({ children, caption }) => (
    <figure className="avoid-break">
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-ink-950 p-2">{children}</div>
      {caption && <figcaption className="mt-2 text-center font-mono text-[10.5px] tracking-wide text-ink-500 uppercase">{caption}</figcaption>}
    </figure>
  );

  if (printMode || !canBlend || mode === "side") {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Frame caption="Input slice">
            <img src={original} alt="Input MRI slice" className="max-h-full max-w-full object-contain" />
          </Frame>
          <Frame caption="Grad-CAM++ overlay">
            <img src={overlay} alt="Grad-CAM++ overlay" className="max-h-full max-w-full object-contain" />
          </Frame>
        </div>
        <JetLegend />
        {!printMode && canBlend && (
          <button onClick={() => setMode("overlay")} className="text-[12.5px] font-medium text-brand-700 hover:underline">
            Switch to interactive overlay
          </button>
        )}
        <CamFootnote tissuePct={tissuePct} layer={layer} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="avoid-break relative flex w-full items-center justify-center overflow-hidden rounded-xl bg-ink-950 px-4 pt-12 pb-6 sm:px-10">
        <div className="relative w-full max-w-[720px]">
          <img src={original} alt="Input MRI slice" className="block h-auto max-h-[460px] w-full object-contain" />
          <img
            src={heatmap}
            alt="Grad-CAM++ attribution"
            className="pointer-events-none absolute inset-0 h-full w-full object-contain mix-blend-screen"
            style={{ opacity }}
          />
        </div>
        <span className="absolute top-3 left-3 rounded-md bg-black/50 px-2 py-1 font-mono text-[10.5px] tracking-wider text-white/80 uppercase backdrop-blur">
          Grad-CAM++ · {layer || "block5_conv4"}
        </span>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <label className="flex flex-1 items-center gap-3">
          <span className="w-28 shrink-0 text-[12.5px] font-medium text-ink-600">Heatmap opacity</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-ink-900"
          />
          <span className="w-10 text-right font-mono text-[12px] text-ink-700 tabular-nums">{Math.round(opacity * 100)}%</span>
        </label>
        <button onClick={() => setMode("side")} className="text-[12.5px] font-medium text-brand-700 hover:underline">
          Side-by-side view
        </button>
      </div>
      <JetLegend />
      <CamFootnote tissuePct={tissuePct} layer={layer} />
    </div>
  );
}

function CamFootnote({ tissuePct }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-ink-500">
      <span>Warm regions contributed most to the model's decision.</span>
      {tissuePct != null && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-0.5 text-ink-700">
          Attribution within head outline <span className="font-mono font-semibold">{tissuePct}%</span>
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Tissue
export function TissueComposition({ biomarkers, source, nativeVolume }) {
  const parts = Object.entries(TISSUE)
    .filter(([k]) => typeof biomarkers?.[k] === "number")
    .map(([k, meta]) => ({ key: k, ...meta, value: biomarkers[k] }));
  const hasComposition = parts.length === 3;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="dark">{source || "—"}</Badge>
        <Badge tone={nativeVolume ? "brand" : "info"}>{nativeVolume ? "Volumetric · 3D scan" : "2D slice"}</Badge>
      </div>
      {hasComposition ? (
        <>
          <div>
            <div className="flex h-9 overflow-hidden rounded-xl ring-1 ring-ink-200">
              {parts.map((p) => (
                <motion.div
                  key={p.key}
                  className="flex items-center justify-center text-[11.5px] font-semibold"
                  style={{ background: p.color, color: p.key === "white_matter_fraction_pct" ? "#19234d" : "#fff" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${p.value}%` }}
                  transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                >
                  {p.value >= 12 ? `${p.value.toFixed(0)}%` : ""}
                </motion.div>
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
              {parts.map((p) => (
                <span key={p.key} className="inline-flex items-center gap-2 text-[12.5px] text-ink-600">
                  <span className="h-2.5 w-2.5 rounded-sm ring-1 ring-black/5" style={{ background: p.color }} />
                  {p.long}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Grey matter" value={biomarkers.grey_matter_fraction_pct} unit="%" />
            <Stat label="CSF" value={biomarkers.csf_fraction_pct} unit="%" />
            <Stat label="GM : WM ratio" value={biomarkers.gm_wm_ratio} digits={2} />
            <Stat label="Parenchymal fraction" value={biomarkers.brain_parenchymal_fraction_pct} unit="%" />
          </div>
        </>
      ) : (
        <p className="rounded-xl bg-ink-50 px-4 py-3 text-[13px] text-ink-600">
          Tissue segmentation wasn't available for this scan, so only intensity statistics are shown below.
        </p>
      )}
      <p className="text-[12.5px] leading-relaxed text-ink-500">
        {nativeVolume
          ? "Tissue volumes computed from the NIfTI voxel dimensions."
          : "Tissue fractions for the uploaded slice. Upload a 3D NIfTI scan for volumetric measurements."}
      </p>
    </div>
  );
}

function Stat({ label, value, unit = "", digits = 1 }) {
  return (
    <div className="rounded-xl bg-ink-50 px-3.5 py-3 ring-1 ring-ink-100">
      <p className="text-[11.5px] font-medium text-ink-500">{label}</p>
      <p className="mt-1 font-mono text-[20px] font-medium text-ink-900 tabular-nums">
        {typeof value === "number" ? value.toFixed(digits) : "—"}
        <span className="ml-0.5 text-[13px] text-ink-400">{typeof value === "number" ? unit : ""}</span>
      </p>
    </div>
  );
}

export function BiomarkerTable({ biomarkers }) {
  const rows = Object.entries(biomarkers || {}).filter(([k]) => k !== "fsl_error" && k !== "note");
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-ink-200">
      <table className="w-full text-left text-[13px]">
        <tbody className="divide-y divide-ink-100">
          {rows.map(([k, v]) => {
            const [label, unit] = BIOMARKER_LABELS[k] || [k.replace(/_/g, " "), ""];
            return (
              <tr key={k} className="bg-white even:bg-ink-50/50">
                <td className="px-4 py-2 text-ink-600">{label}</td>
                <td className="px-4 py-2 text-right font-mono text-ink-900 tabular-nums">
                  {typeof v === "number" ? v.toLocaleString("en-IN", { maximumFractionDigits: 3 }) : String(v)}
                  {unit && typeof v === "number" ? <span className="ml-1 text-ink-400">{unit}</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ Rationale
const HEADING_RE = /^[A-Z0-9][A-Za-z0-9 ,/&()'’:+-]{2,70}:?$/;

/** The LLM rationale is plain text with headings on their own lines; render it as sections. */
export function RationaleText({ text }) {
  const blocks = [];
  let para = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  for (const raw of (text || "").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const isBullet = /^[-•*]\s+/.test(line) || /^\d+[.)]\s+/.test(line);
    const isHeading = !isBullet && HEADING_RE.test(line) && !/[.!?]$/.test(line) && line.split(" ").length <= 8;
    if (isHeading) {
      flush();
      blocks.push({ type: "h", text: line.replace(/:$/, "") });
    } else if (isBullet) {
      flush();
      blocks.push({ type: "li", text: line.replace(/^([-•*]|\d+[.)])\s+/, "") });
    } else {
      para.push(line);
    }
  }
  flush();
  return (
    <div className="space-y-2.5 text-[14px] leading-relaxed text-ink-700">
      {blocks.map((b, i) =>
        b.type === "h" ? (
          <h4 key={i} className="pt-2 text-[13px] font-semibold tracking-wide text-ink-900 uppercase first:pt-0">
            {b.text}
          </h4>
        ) : b.type === "li" ? (
          <p key={i} className="flex gap-2.5 pl-1">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
            <span>{withCitations(b.text)}</span>
          </p>
        ) : (
          <p key={i}>{withCitations(b.text)}</p>
        )
      )}
    </div>
  );
}

function withCitations(text) {
  return text.split(/(\[\d+(?:\s*[,–-]\s*\d+)*\])/g).map((part, i) =>
    /^\[\d/.test(part) ? (
      <sup key={i} className="mx-0.5 rounded bg-brand-50 px-1 font-mono text-[10.5px] font-medium text-brand-800 ring-1 ring-brand-200">
        {part.slice(1, -1)}
      </sup>
    ) : (
      part
    )
  );
}

export function References({ items }) {
  if (!items?.length) return null;
  return (
    <ol className="space-y-2.5">
      {items.map((c) => (
        <li key={c.n} className="avoid-break flex gap-3 text-[13px] leading-snug">
          <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-ink-100 px-1 font-mono text-[11px] font-semibold text-ink-700">
            {c.n}
          </span>
          <span>
            <a href={c.url} target="_blank" rel="noopener noreferrer" className="font-medium text-ink-900 decoration-brand-300 underline-offset-2 hover:underline">
              {c.title}
            </a>
            <span className="text-ink-500"> · {c.year} · PubMed</span>
            <LuArrowUpRight className="no-print ml-1 inline h-3 w-3 text-ink-400" />
          </span>
        </li>
      ))}
    </ol>
  );
}

export function ResultPlaceholder({ icon: Icon = LuBrain, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-ink-50/50 px-6 py-14 text-center">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white text-ink-400 ring-1 ring-ink-200">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-[14px] font-semibold text-ink-800">{title}</p>
      {children && <p className="mt-1 max-w-sm text-[13px] text-ink-500">{children}</p>}
    </div>
  );
}

/** Animated "analysing" state with a scan line over the image. */
export function Analysing({ image, steps }) {
  return (
    <div className="grid gap-6 sm:grid-cols-[220px_1fr] sm:items-center">
      <div className="relative mx-auto aspect-square w-full max-w-[220px] overflow-hidden rounded-2xl bg-ink-950">
        {image && <img src={image} alt="" className="h-full w-full object-contain opacity-80" />}
        <div className="absolute inset-x-0 top-0 h-full">
          <div className="animate-scan h-1/2 w-full bg-gradient-to-b from-transparent via-brand-400/30 to-brand-300/60" />
        </div>
      </div>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-3 text-[13.5px] text-ink-700" style={{ animation: `fade-up 0.5s ${i * 0.35}s both` }}>
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" style={{ animationDelay: `${i * 0.35}s` }} />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-500" />
            </span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}
