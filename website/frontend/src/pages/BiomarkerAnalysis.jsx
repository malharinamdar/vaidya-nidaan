import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ML_BASE } from "../api";

// FSL-based biomarker analysis. Upload an MRI (a 2D image for intensity
// statistics, or a volumetric .nii/.nii.gz/.img for full FSL brain-extraction +
// volumetrics) and view the generated medical report + biomarker table.
function BiomarkerAnalysisPage() {
  const { userId } = useParams();
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setError(null);
    setResult(null);
  };

  const handleSubmit = async () => {
    if (!file) {
      setError("Please select an MRI file (image, .nii, .nii.gz or .img).");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      // The ML service runs FSL BET + FAST tissue segmentation by default.
      const response = await fetch(`${ML_BASE}/report`, {
        method: "POST",
        body: formData,
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!response.ok) throw new Error("Failed to generate biomarker report.");
      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#D0F0E0] via-white to-[#D0F0E0] p-8 text-[#0A0A32] flex justify-center items-start">
      <motion.div
        className="bg-white shadow-2xl rounded-xl p-10 w-full max-w-4xl"
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <div className="mb-6">
          <Link to={`/profile/${userId}`}>
            <button className="px-3 py-2 text-white bg-gray-500 rounded-lg shadow-md hover:bg-gray-600 transition text-sm">
              &larr; Go Back to Profile
            </button>
          </Link>
        </div>

        <header className="text-center space-y-4">
          <h1 className="text-5xl font-bold text-[#0A0A32]">Biomarker Analysis</h1>
          <p className="text-lg text-[#0A0A32] opacity-80">
            FSL-powered brain volumetrics &amp; intensity biomarkers from an MRI scan.
          </p>
        </header>

        <section className="mt-10 text-center">
          <input
            type="file"
            accept="image/*,.nii,.gz,.img,.hdr"
            onChange={handleFileChange}
            className="block w-full text-sm text-[#0A0A32] border border-[#0A0A32] rounded-md py-3 px-4"
          />

          <p className="mt-3 text-sm text-gray-500">
            Runs FSL brain extraction (BET) + FAST tissue segmentation (CSF / grey / white matter).
          </p>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="mt-6 px-16 py-4 text-white bg-[#0A0A32] rounded-xl shadow-lg hover:bg-[#0C0C40] transition text-xl disabled:opacity-60"
          >
            {loading ? "Analyzing..." : "Run Biomarker Analysis"}
          </button>

          {error && <p className="text-red-500 text-center mt-4">{error}</p>}
        </section>

        {result && (
          <section className="mt-10 space-y-6">
            <div className="text-center">
              <h2 className="text-3xl font-semibold text-[#0A0A32]">Results</h2>
              <p className="text-sm text-gray-500 mt-1">
                Analysis source: <span className="font-semibold">{result.source}</span>
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-2">Biomarkers</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-200 rounded-lg">
                  <tbody>
                    {Object.entries(result.biomarkers || {}).map(([k, v]) => (
                      <tr key={k} className="border-b border-gray-100">
                        <td className="px-4 py-2 text-gray-700 capitalize">
                          {k.replace(/_/g, " ")}
                        </td>
                        <td className="px-4 py-2 text-gray-900 font-medium">{String(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-2">Medical Report</h3>
              <pre className="bg-[#f9f9f9] p-4 rounded-lg text-sm text-[#0A0A32] whitespace-pre-wrap border border-gray-200">
{result.report}
              </pre>
            </div>
          </section>
        )}

        <footer className="mt-12 text-center text-[#0A0A32] opacity-70 text-sm">
          <p>&copy; 2025 Vaidya Nidaan. Research/education tool — not a diagnosis.</p>
        </footer>
      </motion.div>
    </div>
  );
}

export default BiomarkerAnalysisPage;
