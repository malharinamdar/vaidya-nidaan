import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LuArrowRight } from "react-icons/lu";
import AuthLayout from "../components/AuthLayout";
import { Alert, Button, Field, Input, Select } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

const SPECIALTIES = ["Neurologist", "Radiologist", "Psychiatrist", "Geriatrician", "General Physician", "Researcher", "Other"];

export default function Signup() {
  const [form, setForm] = useState({ name: "", email: "", password: "", specialty: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.password.length < 8) return setError("Password must be at least 8 characters.");
    setBusy(true);
    try {
      const res = await api("/api/doctors/signup", { method: "POST", body: form });
      signIn(res.token, res.doctor);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create your workspace"
      subtitle="For clinicians and researchers evaluating explainable neuroimaging AI."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-ink-900 underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <Field label="Full name">
          <Input autoComplete="name" value={form.name} onChange={set("name")} placeholder="Dr. Asha Kulkarni" required />
        </Field>
        <Field label="Work email">
          <Input type="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@hospital.org" required />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Password" hint="At least 8 characters">
            <Input type="password" autoComplete="new-password" value={form.password} onChange={set("password")} placeholder="••••••••" required minLength={8} />
          </Field>
          <Field label="Specialty">
            <Select value={form.specialty} onChange={set("specialty")} required>
              <option value="" disabled>Select…</option>
              {SPECIALTIES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" size="lg" className="w-full rounded-full" loading={busy} iconRight={LuArrowRight}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
