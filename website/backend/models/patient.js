const mongoose = require('mongoose');

// Patient Schema
const patientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    // Email is optional: the "Create Patient" form does not collect it.
    // `sparse` lets multiple patients omit the email without unique-index clashes.
    email: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
    },
    age: {
      type: Number,
      required: true,
    },
    gender: {
      type: String,
      required: true,
    },

    // Risk-factor questionnaire captured on patient creation.
    smoker: {
      type: String, // "Yes" | "No"
      required: false,
    },
    alcoholConsumption: {
      type: String, // "Never" | "Low" | "High"
      required: false,
    },
    neurologicalCondition: {
      type: String, // "Yes" | "No"
      required: false,
    },

    // Brain Tumor Detection Specific Data
    brainScan: {
      scanType: { type: String, required: false },
      scanDate: { type: Date, required: false },
      scanImage: { type: String, required: false }, // URL or path to the scan image
      tumorDetected: { type: Boolean, required: false },
      tumorType: { type: String, required: false },
    },

    // Alzheimer's Detection Specific Data
    alzheimerBiomarkers: {
      type: [String], // List of biomarkers for Alzheimer's diagnosis
      required: false,
    },
    // Latest model inference result (classification + probability + report).
    alzheimerResult: {
      prediction: { type: String, required: false },
      probability: { type: Number, required: false },
      report: { type: String, required: false },
      analyzedAt: { type: Date, required: false },
    },
    cognitiveTests: [
      {
        testName: { type: String, required: false },
        testDate: { type: Date, required: false },
        score: { type: Number, required: false }, // e.g. MoCA, MMSE
        interpretation: { type: String, required: false },
      },
    ],

    // Doctor Association
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
    },
  },
  {
    timestamps: true, // adds createdAt / updatedAt (used by the profile page)
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id; // expose `id` so the frontend can use patient.id
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Create and export the model
module.exports = mongoose.model('Patient', patientSchema);
