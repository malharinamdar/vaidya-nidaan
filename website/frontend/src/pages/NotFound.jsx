import { LuArrowLeft } from "react-icons/lu";
import { LogoMark } from "../components/Logo";
import { Button } from "../components/ui";

export default function NotFound() {
  return (
    <div className="relative isolate flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[url('/art/hero-glass.webp')] bg-cover bg-center opacity-60" />
      <LogoMark className="h-16 w-16" />
      <p className="mt-8 font-mono text-[12px] tracking-[0.16em] text-ink-500 uppercase">404</p>
      <h1 className="mt-2 font-display text-[52px] leading-none text-ink-900">Nothing on this slice.</h1>
      <p className="mt-4 max-w-sm text-[15px] text-ink-600">The page you're looking for doesn't exist or has moved.</p>
      <Button to="/" icon={LuArrowLeft} className="mt-8 rounded-full">
        Back home
      </Button>
    </div>
  );
}
