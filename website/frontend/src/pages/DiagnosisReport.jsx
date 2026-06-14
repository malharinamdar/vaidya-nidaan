import React, { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { API_BASE, ML_BASE, authHeader } from "../api";

// Full structured diagnosis: model prediction + Grad-CAM++ + FSL biomarkers + LLM rationale.
function DiagnosisReportPage() {
  const { userId } = useParams();
  const [patient, setPatient] = useState(null);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchPatient = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/patients/${userId}`, { headers: authHeader() });
        if (res.ok) {
          const data = await res.json();
          setPatient(data.patient);
        }
      } catch (_) { /* context is optional */ }
    };
    if (userId) fetchPatient();
  }, [userId]);

  const handleSubmit = async () => {
    if (!file) {
      setError("Please select an MRI scan (image, .nii, .nii.gz or .img).");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    if (patient) {
      formData.append(
        "patient",
        JSON.stringify({
          name: patient.name,
          age: patient.age,
          gender: patient.gender,
          smoker: patient.smoker,
          alcoholConsumption: patient.alcoholConsumption,
          neurologicalCondition: patient.neurologicalCondition,
        })
      );
    }

    try {
      const res = await fetch(`${ML_BASE}/api/patients/${userId}/diagnosis`, {
        method: "POST",
        body: formData,
        headers: authHeader(),
      });
      if (!res.ok) throw new Error("Failed to generate diagnosis report.");
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = () => {
    const blob = new Blob([result.report], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diagnosis_${patient?.name || userId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pred = result?.prediction;
  const isDementia = pred && pred.prediction !== "Non Demented";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#D0F0E0] via-white to-[#D0F0E0] p-8 text-[#0A0A32] flex justify-center items-start">
      <motion.div
        className="bg-white shadow-2xl rounded-xl p-10 w-full max-w-5xl"
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
      >
        <div className="mb-6">
          <Link to={`/profile/${userId}`}>
            <button className="px-3 py-2 text-white bg-gray-500 rounded-lg shadow-md hover:bg-gray-600 transition text-sm">
              &larr; Go Back to Profile
            </button>
          </Link>
        </div>

        <header className="text-center space-y-3">
          <h1 className="text-5xl font-bold">Diagnosis Report</h1>
          <p className="text-lg opacity-80">
            Model prediction · Grad-CAM++ · FSL biomarkers · AI clinical rationale
          </p>
          {patient && (
            <p className="text-sm text-gray-500">
              Patient: <span className="font-semibold">{patient.name}</span> · Age {patient.age} · {patient.gender}
            </p>
          )}
        </header>

        <section className="mt-8 text-center">
          <input
            type="file"
            accept="image/*,.nii,.gz,.img,.hdr"
            onChange={(e) => { setFile(e.target.files[0]); setError(null); }}
            className="block w-full text-sm border border-[#0A0A32] rounded-md py-3 px-4"
          />
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="mt-6 px-14 py-4 text-white bg-[#0A0A32] rounded-xl shadow-lg hover:bg-[#0C0C40] transition text-xl disabled:opacity-60"
          >
            {loading ? "Analyzing… (may take up to a minute)" : "Generate Full Diagnosis Report"}
          </button>
          {error && <p className="text-red-500 mt-4">{error}</p>}
        </section>

        {result && (
          <section className="mt-10 space-y-8">
            {/* 1. Prediction */}
            <div>
              <h2 className="text-2xl font-bold mb-3">1. AI Model Prediction</h2>
              <div className={`p-5 rounded-xl ${isDementia ? "bg-red-50" : "bg-green-50"}`}>
                <p className="text-xl">
                  Predicted class:{" "}
                  <span className="font-bold">{pred.prediction}</span>
                </p>
                <p className="text-lg">Dementia probability: <span className="font-semibold">{pred.alzheimer_probability}%</span></p>
                <div className="mt-3 space-y-1">
                  {Object.entries(pred.per_class || {}).map(([cls, p]) => (
                    <div key={cls} className="flex items-center gap-3">
                      <span className="w-44 text-sm">{cls}</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div className="bg-[#0A0A32] h-3" style={{ width: `${p}%` }} />
                      </div>
                      <span className="w-14 text-right text-sm">{p}%</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-3">Classifier backend: {result.classifier_backend}</p>
              </div>
            </div>

            {/* 2. Grad-CAM */}
            <div>
              <h2 className="text-2xl font-bold mb-3">2. Grad-CAM++ Explainability</h2>
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 text-center">
                  <p className="font-semibold mb-2">Input MRI</p>
                  <img src={result.gradcam.mriUrl} alt="MRI" className="rounded-lg border w-full object-contain max-h-80 mx-auto" />
                </div>
                <div className="flex-1 text-center">
                  <p className="font-semibold mb-2">Grad-CAM++ Overlay</p>
                  <img src={result.gradcam.gradCamResult} alt="Grad-CAM++" className="rounded-lg border w-full object-contain max-h-80 mx-auto" />
                </div>
              </div>
            </div>

            {/* 3. Biomarkers */}
            <div>
              <h2 className="text-2xl font-bold mb-3">3. Biomarker Analysis <span className="text-sm font-normal text-gray-500">({result.biomarker_source})</span></h2>
              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-200 rounded-lg">
                  <tbody>
                    {Object.entries(result.biomarkers || {}).map(([k, v]) => (
                      <tr key={k} className="border-b border-gray-100">
                        <td className="px-4 py-2 text-gray-700 capitalize">{k.replace(/_/g, " ")}</td>
                        <td className="px-4 py-2 text-gray-900 font-medium">{String(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4. LLM rationale */}
            <div>
              <h2 className="text-2xl font-bold mb-3">4. Clinical Rationale (AI)</h2>
              <pre className="bg-[#f9f9f9] p-5 rounded-lg text-sm whitespace-pre-wrap border border-gray-200 font-sans">
{result.rationale}
              </pre>
            </div>

            <div className="text-center">
              <button onClick={downloadReport} className="px-8 py-3 text-white bg-[#388e3c] rounded-lg shadow-md hover:bg-[#2c6d31] transition">
                Download Full Report (.txt)
              </button>
            </div>
          </section>
        )}

        <footer className="mt-12 text-center opacity-70 text-sm">
          <p>&copy; 2025 Vaidya Nidaan. Decision-support tool — not a diagnosis.</p>
        </footer>
      </motion.div>
    </div>
  );
}

export default DiagnosisReportPage;
