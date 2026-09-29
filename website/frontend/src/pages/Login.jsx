import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LuArrowRight, LuSparkles } from "react-icons/lu";
import AuthLayout from "../components/AuthLayout";
import { Alert, Button, Field, Input } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // "login" | "demo"
  const { signIn, startDemo } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy("login");
    try {
      const res = await api("/api/doctors/login", { method: "POST", body: { email, password } });
      signIn(res.token, res.doctor);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const demo = async () => {
    setError(null);
    setBusy("demo");
    try {
      await startDemo();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your clinician workspace."
      footer={
        <>
          New to Vaidya Nidaan?{" "}
          <Link to="/signup" className="font-semibold text-ink-900 underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <Field label="Email">
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@hospital.org" required />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
        </Field>
        <Button type="submit" size="lg" className="w-full rounded-full" loading={busy === "login"} iconRight={LuArrowRight}>
          Sign in
        </Button>
      </form>
      <div className="my-6 flex items-center gap-3 text-[12px] text-ink-400">
        <span className="h-px flex-1 bg-ink-200" /> or <span className="h-px flex-1 bg-ink-200" />
      </div>
      <Button variant="secondary" size="lg" className="w-full rounded-full" icon={LuSparkles} loading={busy === "demo"} onClick={demo}>
        Explore the demo workspace
      </Button>
    </AuthLayout>
  );
}
