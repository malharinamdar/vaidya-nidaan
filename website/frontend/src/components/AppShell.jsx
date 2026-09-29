import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { LuBot, LuCircleHelp, LuLayoutDashboard, LuLogOut, LuMenu, LuPlus, LuX, LuTriangleAlert } from "react-icons/lu";
import Logo from "./Logo";
import ModelCard from "./ModelCard";
import { Modal, cx } from "./ui";
import { useAuth } from "../lib/auth";
import { initials } from "../lib/format";

const NAV = [
  { to: "/dashboard", label: "Patients", icon: LuLayoutDashboard },
  { to: "/assistant", label: "AI Assistant", icon: LuBot },
];

function Sidebar({ onNavigate, onModelCard }) {
  const { doctor, signOut, isDemo } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col border-r border-ink-200/70 bg-white/80 px-4 pt-5 pb-4 backdrop-blur-xl">
      <Link to="/dashboard" onClick={onNavigate} className="px-1.5">
        <Logo size="sm" />
      </Link>

      <Link
        to="/patients/new"
        onClick={onNavigate}
        className="mt-7 flex items-center justify-center gap-2 rounded-full bg-ink-900 px-3 py-2.5 text-[13.5px] font-medium text-white shadow-lg shadow-ink-900/15 transition hover:bg-ink-800"
      >
        <LuPlus className="h-4 w-4" /> New patient
      </Link>

      <p className="mt-7 mb-2 px-3 font-mono text-[10px] tracking-[0.16em] text-ink-400 uppercase">Workspace</p>
      <nav className="space-y-0.5">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition",
                isActive ? "bg-ink-100/80 text-ink-900" : "text-ink-500 hover:bg-ink-50 hover:text-ink-900"
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cx("h-[17px] w-[17px]", isActive ? "text-brand-600" : "")} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-2">
        <button
          onClick={onModelCard}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium text-ink-500 transition hover:bg-ink-50 hover:text-ink-900"
        >
          <LuCircleHelp className="h-[17px] w-[17px]" /> Model card
        </button>
        <div className="flex items-center gap-3 rounded-2xl border border-ink-200/70 bg-ink-50/70 p-2.5">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-300 to-sky-300 text-[12.5px] font-semibold text-ink-900">
            {initials(doctor?.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-ink-900">{doctor?.name || "…"}</p>
            <p className="truncate text-[11.5px] text-ink-500">{isDemo ? "Demo workspace" : doctor?.specialty}</p>
          </div>
          <button
            aria-label="Sign out"
            title="Sign out"
            onClick={() => {
              signOut();
              navigate("/");
            }}
            className="rounded-lg p-2 text-ink-400 transition hover:bg-white hover:text-ink-900"
          >
            <LuLogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppShell() {
  const [open, setOpen] = useState(false);
  const [modelCard, setModelCard] = useState(false);
  const { isDemo } = useAuth();
  return (
    <div className="min-h-screen bg-ink-50">
      {/* soft atmospheric wash behind the workspace */}
      <div aria-hidden className="no-print pointer-events-none fixed inset-x-0 top-0 h-[420px] bg-[url('/art/hero-glass.webp')] bg-cover bg-top opacity-[0.22] [mask-image:linear-gradient(to_bottom,black,transparent)]" />

      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar onModelCard={() => setModelCard(true)} />
      </aside>

      <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-ink-200/70 bg-white/85 px-4 py-2.5 backdrop-blur lg:hidden">
        <Link to="/dashboard">
          <Logo size="sm" />
        </Link>
        <button aria-label="Open menu" onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink-700 hover:bg-ink-100">
          <LuMenu className="h-5 w-5" />
        </button>
      </header>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div className="absolute inset-0 bg-ink-950/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside
              className="absolute inset-y-0 left-0 w-72 bg-white"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
            >
              <button aria-label="Close menu" onClick={() => setOpen(false)} className="absolute top-4 right-3 z-10 rounded-lg p-2 text-ink-400 hover:text-ink-900">
                <LuX className="h-5 w-5" />
              </button>
              <Sidebar onNavigate={() => setOpen(false)} onModelCard={() => { setOpen(false); setModelCard(true); }} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="relative lg:pl-64">
        {isDemo && (
          <div className="no-print flex items-center justify-center gap-2 border-b border-amber-200/80 bg-amber-50/90 px-4 py-2 text-center text-[12.5px] text-amber-900 backdrop-blur">
            <LuTriangleAlert className="h-3.5 w-3.5 shrink-0" />
            <span>
              Demo workspace with fictional patients — please don't upload real patient data.
            </span>
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <Outlet />
        </main>
      </div>

      <Modal open={modelCard} onClose={() => setModelCard(false)} title="Model card" subtitle="The models and data behind Vaidya Nidaan." size="lg">
        <ModelCard />
      </Modal>
    </div>
  );
}
