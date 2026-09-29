import { useState } from "react";
import { Alert, Button, Field, Input, Segmented, Select, Textarea } from "./ui";

const EMPTY = { name: "", age: "", gender: "", smoker: "", alcoholConsumption: "", neurologicalCondition: "", notes: "" };

export default function PatientForm({ initial, onSubmit, submitLabel = "Save patient", onCancel }) {
  const [form, setForm] = useState({ ...EMPTY, ...(initial || {}) });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const age = Number(form.age);
    if (!form.name.trim()) return setError("Enter the patient's name.");
    if (!Number.isFinite(age) || age < 0 || age > 120) return setError("Enter an age between 0 and 120.");
    if (!form.gender) return setError("Select the patient's sex.");
    setBusy(true);
    try {
      await onSubmit({ ...form, name: form.name.trim(), age });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-7">
      {error && <Alert>{error}</Alert>}
      <fieldset>
        <legend className="label-eyebrow mb-4">Identity</legend>
        <div className="grid gap-5 sm:grid-cols-[1fr_120px]">
          <Field label="Full name">
            <Input value={form.name} onChange={set("name")} placeholder="e.g. Sunita Rao" required />
          </Field>
          <Field label="Age">
            <Input type="number" min={0} max={120} value={form.age} onChange={set("age")} placeholder="72" required />
          </Field>
        </div>
        <Field label="Sex" className="mt-5">
          <Select value={form.gender} onChange={set("gender")} required>
            <option value="" disabled>Select…</option>
            <option>Female</option>
            <option>Male</option>
            <option>Other</option>
          </Select>
        </Field>
      </fieldset>

      <fieldset>
        <legend className="label-eyebrow mb-4">Risk factors</legend>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Smoker">
            <Segmented name="Smoker" options={["Yes", "No"]} value={form.smoker} onChange={set("smoker")} />
          </Field>
          <Field label="Alcohol">
            <Segmented name="Alcohol" options={["Never", "Low", "High"]} value={form.alcoholConsumption} onChange={set("alcoholConsumption")} />
          </Field>
          <Field label="Neurological history">
            <Segmented name="Neurological history" options={["Yes", "No"]} value={form.neurologicalCondition} onChange={set("neurologicalCondition")} />
          </Field>
        </div>
      </fieldset>

      <Field label="Clinical notes" hint="Optional — presenting complaint, cognitive scores, history.">
        <Textarea value={form.notes || ""} onChange={set("notes")} placeholder="e.g. Progressive forgetfulness over 18 months. MMSE 24/30." />
      </Field>

      <div className="flex justify-end gap-2 border-t border-ink-100 pt-5">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
