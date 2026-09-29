import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { LuArrowLeft, LuEye, LuLayers, LuBookOpen } from "react-icons/lu";
import Logo from "./Logo";

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-6 py-6 sm:px-12 lg:px-16">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="Home">
            <Logo size="sm" />
          </Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 hover:text-ink-900">
            <LuArrowLeft className="h-3.5 w-3.5" /> Back to site
          </Link>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-12"
        >
          <h1 className="font-display text-[42px] leading-[1.05] text-ink-900">{title}</h1>
          {subtitle && <p className="mt-3 text-[15px] text-ink-500">{subtitle}</p>}
          <div className="mt-9">{children}</div>
          {footer && <div className="mt-8 text-center text-[13.5px] text-ink-500">{footer}</div>}
        </motion.div>
        <p className="text-center text-[11.5px] text-ink-400">Research & education only — not a medical device.</p>
      </div>

      <div className="relative isolate hidden overflow-hidden lg:block">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[url('/art/glass-dark.webp')] bg-cover bg-center" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-ink-950/80 via-transparent to-transparent" />
        <div className="flex h-full flex-col justify-between p-12 text-white">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-medium ring-1 ring-white/15 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-300" /> Clinician workspace
          </span>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto w-full max-w-md"
          >
            <div className="overflow-hidden rounded-3xl bg-white/10 p-3 ring-1 ring-white/20 backdrop-blur-xl">
              <div className="relative flex aspect-[2/1] items-center justify-center overflow-hidden rounded-2xl bg-ink-950">
                <div className="relative h-full">
                  <img src="/hero/mri.png" alt="" className="h-full w-auto" />
                  <img src="/hero/heatmap.png" alt="" className="absolute inset-0 h-full w-full opacity-75 mix-blend-screen" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 p-2 pt-3 text-[11.5px]">
                {[
                  [LuEye, "Grad-CAM++"],
                  [LuLayers, "FSL tissue"],
                  [LuBookOpen, "PubMed RAG"],
                ].map(([Icon, l]) => (
                  <span key={l} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2 ring-1 ring-white/10">
                    <Icon className="h-3.5 w-3.5 text-brand-300" /> {l}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>

          <blockquote>
            <p className="font-display text-[30px] leading-[1.15]">
              “A prediction is a claim. <span className="text-white/55 italic">The report is the evidence.”</span>
            </p>
            <p className="mt-4 font-mono text-[11px] tracking-[0.14em] text-white/50 uppercase">Vaidya Nidaan · design principle</p>
          </blockquote>
        </div>
      </div>
    </div>
  );
}
