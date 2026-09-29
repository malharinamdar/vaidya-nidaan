import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { LuChevronDown, LuCircleAlert, LuCircleCheck, LuInfo, LuLoaderCircle, LuX } from "react-icons/lu";

const cx = (...c) => c.filter(Boolean).join(" ");
export { cx };

// ---------------------------------------------------------------- Button
const VARIANTS = {
  primary: "bg-ink-900 text-white hover:bg-ink-800 shadow-sm shadow-ink-900/20",
  brand: "bg-brand-500 text-white hover:bg-brand-600 shadow-sm shadow-brand-700/25",
  secondary: "bg-white text-ink-800 border border-ink-200 hover:border-ink-300 hover:bg-ink-50",
  ghost: "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
  danger: "bg-white text-rose-600 border border-rose-200 hover:bg-rose-50",
  "danger-solid": "bg-rose-600 text-white hover:bg-rose-700",
  light: "bg-white text-ink-900 hover:bg-ink-50 shadow-sm",
};
const SIZES = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-[15px] gap-2.5 rounded-xl",
};

export function Button({ variant = "primary", size = "md", loading, icon: Icon, iconRight: IconRight, to, href, className, children, disabled, ...rest }) {
  const cls = cx(
    "inline-flex items-center justify-center font-medium whitespace-nowrap transition-all duration-150 select-none",
    "disabled:cursor-not-allowed disabled:opacity-50 active:translate-y-px",
    VARIANTS[variant],
    SIZES[size],
    className
  );
  const content = (
    <>
      {loading ? <LuLoaderCircle className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
      {children}
      {IconRight && !loading && <IconRight className="h-4 w-4 shrink-0" />}
    </>
  );
  if (to) return <Link to={to} className={cls} {...rest}>{content}</Link>;
  if (href) return <a href={href} className={cls} {...rest}>{content}</a>;
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className, ...rest }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx("inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 transition hover:bg-ink-100 hover:text-ink-900", className)}
      {...rest}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}

// ---------------------------------------------------------------- Surfaces
export function Card({ className, children, ...rest }) {
  return <div className={cx("card", className)} {...rest}>{children}</div>;
}

export function CardHeader({ title, subtitle, icon: Icon, action, className }) {
  return (
    <div className={cx("flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4 sm:px-6", className)}>
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-100">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div>
          <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

const BADGE = {
  neutral: "bg-ink-100 text-ink-700 ring-ink-200",
  brand: "bg-brand-50 text-brand-800 ring-brand-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  warn: "bg-amber-50 text-amber-800 ring-amber-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  dark: "bg-ink-900 text-white ring-ink-900",
};
export function Badge({ tone = "neutral", dot, className, children }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium ring-1 ring-inset", BADGE[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

export function Spinner({ className = "h-5 w-5" }) {
  return <LuLoaderCircle className={cx("animate-spin text-brand-600", className)} />;
}

export function Skeleton({ className }) {
  return <div className={cx("skeleton", className)} />;
}

export function EmptyState({ icon: Icon, title, children, action, className }) {
  return (
    <div className={cx("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {Icon && (
        <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-500">
          <Icon className="h-6 w-6" />
        </span>
      )}
      <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-sm text-ink-500">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "danger", title, children, className, onRetry }) {
  const tones = {
    danger: ["border-rose-200 bg-rose-50 text-rose-800", LuCircleAlert],
    warn: ["border-amber-200 bg-amber-50 text-amber-900", LuCircleAlert],
    info: ["border-sky-200 bg-sky-50 text-sky-900", LuInfo],
    success: ["border-brand-200 bg-brand-50 text-brand-900", LuCircleCheck],
  };
  const [cls, Icon] = tones[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", cls, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 font-semibold underline underline-offset-2">
          Retry
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Forms
export function Field({ label, hint, error, children, className }) {
  return (
    <label className={cx("block", className)}>
      {label && <span className="mb-1.5 block text-[13px] font-medium text-ink-700">{label}</span>}
      {children}
      {error ? (
        <span className="mt-1.5 block text-[12px] text-rose-600">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[12px] text-ink-500">{hint}</span>
      ) : null}
    </label>
  );
}

const inputCls =
  "block w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-[14.5px] text-ink-900 shadow-sm shadow-ink-900/[0.02] placeholder:text-ink-400 transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100 focus:outline-none disabled:bg-ink-50";

export function Input({ className, ...rest }) {
  return <input className={cx(inputCls, className)} {...rest} />;
}
export function Select({ className, children, ...rest }) {
  return (
    <span className="relative block">
      <select className={cx(inputCls, "appearance-none pr-10", className)} {...rest}>
        {children}
      </select>
      <LuChevronDown className="pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-ink-400" />
    </span>
  );
}
export function Textarea({ className, ...rest }) {
  return <textarea className={cx(inputCls, "min-h-[88px] resize-y", className)} {...rest} />;
}

/** Segmented choice (for Yes/No and Never/Low/High questions). */
export function Segmented({ options, value, onChange, name }) {
  return (
    <div role="radiogroup" aria-label={name} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-ink-200 bg-ink-50 p-1">
      {options.map((opt) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === opt}
          key={opt}
          onClick={() => onChange(opt)}
          className={cx(
            "rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition",
            value === opt ? "bg-white text-ink-900 shadow-sm ring-1 ring-ink-200" : "text-ink-500 hover:text-ink-800"
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Tabs
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cx(
              "relative inline-flex shrink-0 items-center gap-1.5 px-2.5 py-3 text-[13px] font-medium transition xl:px-3",
              on ? "text-ink-900" : "text-ink-500 hover:text-ink-800"
            )}
          >
            {t.icon && <t.icon className={cx("h-4 w-4", on ? "text-brand-600" : "")} />}
            {t.label}
            {t.badge}
            {on && <motion.span layoutId="tab-underline" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-ink-900" />}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Modal
export function Modal({ open, onClose, title, subtitle, children, footer, size = "md" }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTimeout(() => ref.current?.querySelector("input,select,textarea,button")?.focus(), 50);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cx(
              "relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-[var(--shadow-lift)] sm:rounded-3xl",
              size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg"
            )}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
          >
            <div className="flex items-start justify-between gap-4 px-6 pt-6">
              <div>
                <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
                {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
              </div>
              <IconButton icon={LuX} label="Close" onClick={onClose} className="-mt-1 -mr-2" />
            </div>
            <div className="px-6 pt-5 pb-6">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-ink-100 bg-ink-50/60 px-6 py-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmDialog({ open, title, children, confirmLabel = "Delete", onConfirm, onClose, loading }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger-solid" loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-sm text-ink-600">{children}</p>
    </Modal>
  );
}

// ---------------------------------------------------------------- Toasts
const ToastContext = createContext(() => {});
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="no-print pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24 }}
              className="pointer-events-auto flex items-start gap-3 rounded-2xl bg-ink-900 px-4 py-3 text-sm text-white shadow-[var(--shadow-lift)]"
            >
              {t.tone === "error" ? (
                <LuCircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
              ) : (
                <LuCircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />
              )}
              <span>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
