import React, { useState } from "react";
import { Link, useParams } from "react-router-dom"; // Use useParams to get the userId from the URL
import { ML_BASE } from "../api";

function GradCamAnalysisPage() {
  const { userId } = useParams(); // Fetch the userId from the URL

  const initialData = {
    image: null,
    gradCamResult: null,
  };

  const [data, setData] = useState(initialData);
  const [imageFile, setImageFile] = useState(null); // Store the uploaded file
  const [isProcessing, setIsProcessing] = useState(false); // Track if Grad-CAM is being processed
  const [error, setError] = useState(null);

  // Handle Image File Selection
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setImageFile(file);
      setError(null);
      setData({ image: URL.createObjectURL(file), gradCamResult: null }); // Show selected image in UI
    }
  };

  // Handle Grad-CAM Analysis
  const handleGradCamAnalysis = async () => {
    if (!imageFile) {
      setError("Please upload an image first.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", imageFile);

    try {
      const response = await fetch(`${ML_BASE}/api/patients/${userId}/gradcam`, {
        method: "POST",
        body: formData,
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to process Grad-CAM analysis.");
      }

      const result = await response.json();
      setData({
        gradCamResult: result.gradCamResult, // heatmap overlay (data URL)
        image: result.mriUrl, // preprocessed MRI (data URL)
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-[#D0F0E0] via-white to-[#D0F0E0] flex justify-center items-center p-8">
      <div className="bg-white shadow-2xl rounded-3xl p-10 w-full max-w-6xl flex flex-col items-center relative">
        
        {/* Go Back Button in the top-left corner */}
        <div className="absolute top-10 left-4">
          <Link to={`/profile/${userId}`}>
            <button className="px-3 py-3 text-white bg-gray-500 rounded-lg shadow-md hover:bg-gray-600 transition duration-300 text-sm">
              Go Back to Profile
            </button>
          </Link>
        </div>

        {/* Heading */}
        <h2 className="text-4xl font-bold text-gray-800 mb-6">Grad-CAM Analysis</h2>

        {/* Image Upload Section */}
        <div className="w-full flex flex-col items-center mb-8">
          <h3 className="text-xl font-semibold text-gray-700 mb-4">Upload Image for Grad-CAM Analysis</h3>
          <input
            type="file"
            onChange={handleFileChange}
            className="w-full border-2 border-gray-300 p-2 rounded-lg mb-4"
          />
          {error && <p className="text-red-500 mt-2">{error}</p>}
        </div>

        {/* Uploaded Image Section */}
        <div className="w-full flex space-x-10 mb-8">
          {/* Uploaded Image */}
          <div className="w-1/2 flex flex-col items-center">
            <h3 className="text-xl font-semibold text-gray-700 mb-4">Uploaded Image</h3>
            <div className="w-full h-[450px] flex items-center justify-center bg-gray-200 rounded-lg overflow-hidden">
              {data.image ? (
                <img
                  src={data.image}
                  alt="Uploaded"
                  className="w-full h-full object-cover"
                />
              ) : (
                <p className="text-gray-500">No image uploaded</p>
              )}
            </div>
          </div>

          {/* Grad-CAM Result */}
          <div className="w-1/2 flex flex-col items-center">
            <h3 className="text-xl font-semibold text-gray-700 mb-4">Grad-CAM Result</h3>
            <div className="w-full h-[450px] flex items-center justify-center bg-gray-200 rounded-lg overflow-hidden">
              {data.gradCamResult ? (
                <img
                  src={data.gradCamResult}
                  alt="Grad-CAM Result"
                  className="w-full h-full object-cover"
                />
              ) : (
                <p className="text-gray-500">No Grad-CAM analysis available</p>
              )}
            </div>
          </div>
        </div>

        {/* Process Grad-CAM Button */}
        <div className="mt-4">
          <button
            onClick={handleGradCamAnalysis}
            disabled={isProcessing}
            className="px-5 py-2 bg-teal-500 text-white rounded-lg shadow-md hover:bg-teal-600 disabled:bg-gray-300 transition duration-300"
          >
            {isProcessing ? "Processing..." : "Run Grad-CAM Analysis"}
          </button>
        </div>

      </div>
    </div>
  );
}

export default GradCamAnalysisPage;
