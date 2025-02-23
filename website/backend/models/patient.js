const mongoose = require('mongoose');

// Patient Schema
const patientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  age: {
    type: Number,
    required: true,
  },
  gender: {
    type: String,
    required: true,
  },

  // Brain Tumor Detection Specific Data
  brainScan: {
    scanType: {
      type: String, // MRI, CT scan, etc.
      required: false,
    },
    scanDate: {
      type: Date,
      required: false,
    },
    scanImage: {
      type: String, // URL or path to the scan image
      required: false,
    },
    tumorDetected: {
      type: Boolean, // Whether a tumor was detected or not
      required: false,
    },
    tumorType: {
      type: String, // E.g., malignant, benign (optional)
      required: false,
    },
  },

  // Alzheimer's Detection Specific Data
  alzheimerBiomarkers: {
    type: [String], // List of biomarkers for Alzheimer's diagnosis
    required: false,
  },
  cognitiveTests: [
    {
      testName: {
        type: String,
        required: false,
      },
      testDate: {
        type: Date,
        required: false,
      },
      score: {
        type: Number, // Score from cognitive test (e.g., MoCA, MMSE)
        required: false,
      },
      interpretation: {
        type: String, // Interpretation of test results (e.g., "Normal", "Mild Cognitive Impairment")
        required: false,
      },
    },
  ],

  // Doctor Association
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor', // Reference to the Doctor model
    required: true, // Each patient must have a doctor
  },
});

// Create and export the model
module.exports = mongoose.model('Patient', patientSchema);
