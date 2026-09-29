import { Link, useNavigate } from "react-router-dom";
import { LuArrowLeft } from "react-icons/lu";
import PatientForm from "../components/PatientForm";
import { Card, useToast } from "../components/ui";
import { api } from "../lib/api";

export default function NewPatient() {
  const navigate = useNavigate();
  const toast = useToast();
  const create = async (data) => {
    const res = await api("/api/patients", { method: "POST", body: data });
    toast(`${res.patient.name} added`);
    navigate(`/patients/${res.patient.id}`);
  };
  return (
    <div className="mx-auto max-w-2xl animate-fade-up">
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 hover:text-ink-900">
        <LuArrowLeft className="h-3.5 w-3.5" /> Patients
      </Link>
      <h1 className="mt-4 font-display text-[44px] leading-none text-ink-900">New patient</h1>
      <p className="mt-3 text-[15px] text-ink-500">Create the record first — you'll upload the MRI scan in the patient's workspace.</p>
      <Card className="mt-8 p-6 sm:p-8">
        <PatientForm onSubmit={create} submitLabel="Create patient" onCancel={() => navigate("/dashboard")} />
      </Card>
    </div>
  );
}
