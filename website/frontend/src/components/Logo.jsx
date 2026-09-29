// The original Vaidya Nidaan logo, used as-is: the brain-in-a-ring mark and the
// "VAIDYA NIDAAN" wordmark are cropped straight from src/assets/logo.png
// (public/brand/*), never redrawn.
import { cx } from "./ui";

export function LogoMark({ className = "h-9 w-9", onDark = false }) {
  return (
    <span className={cx("relative inline-flex shrink-0 items-center justify-center", className)}>
      {onDark && <span className="absolute inset-[9%] rounded-full bg-white" />}
      <img src="/brand/logo-mark.png" alt="" className="relative h-full w-full object-contain" draggable="false" />
    </span>
  );
}

export default function Logo({ onDark = false, size = "md", className }) {
  const mark = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const word = size === "lg" ? "h-[22px]" : size === "sm" ? "h-[15px]" : "h-[18px]";
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)} aria-label="Vaidya Nidaan">
      <LogoMark className={mark} onDark={onDark} />
      <img
        src={onDark ? "/brand/logo-wordmark-white.png" : "/brand/logo-wordmark.png"}
        alt="Vaidya Nidaan"
        className={cx("w-auto", word)}
        draggable="false"
      />
    </span>
  );
}
