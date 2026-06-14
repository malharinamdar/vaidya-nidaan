import React, { useState } from "react";
import axios from "axios";
import { ML_BASE } from "../api";

const FileUpload = () => {
    const [file, setFile] = useState(null);
    const [uploadedUrl, setUploadedUrl] = useState("");

    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
    };

    const handleUpload = async () => {
        if (!file) {
            alert("Please select a file to upload!");
            return;
        }

        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await axios.post(`${ML_BASE}/gradcam`, formData, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                    "Content-Type": "multipart/form-data",
                },
            });

            if (response.data.gradCamResult) {
                setUploadedUrl(response.data.gradCamResult);
            }
        } catch (error) {
            console.error("Error uploading file:", error);
            alert("Failed to upload file.");
        }
    };

    return (
        <div>
            <input type="file" onChange={handleFileChange} />
            <button onClick={handleUpload}>Upload</button>

            {uploadedUrl && (
                <div>
                    <h3>Uploaded File:</h3>
                    <img src={uploadedUrl} alt="Uploaded" style={{ width: "300px", height: "auto" }} />
                </div>
            )}
        </div>
    );
};

export default FileUpload;
