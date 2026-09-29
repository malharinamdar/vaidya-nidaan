const mongoose = require('mongoose');

// A saved Full Diagnosis Report: exactly what the ML service returned, plus a snapshot
// of the patient at the time of the scan (so later profile edits don't rewrite history).
const reportSchema = new mongoose.Schema(
  {
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    patientSnapshot: {
      name: String,
      age: Number,
      gender: String,
      smoker: String,
      alcoholConsumption: String,
      neurologicalCondition: String,
    },
    scanName: { type: String, maxlength: 300 },

    prediction: {
      label: { type: String, required: true },
      probability: { type: Number, required: true }, // P(Demented), %
      perClass: { type: mongoose.Schema.Types.Mixed },
      message: String,
    },
    gradcam: {
      overlay: String, // data:image/png;base64,...
      original: String,
      heatmap: String,
      layer: String,
      tissueAttributionPct: Number,
    },
    biomarkers: { type: mongoose.Schema.Types.Mixed },
    biomarkerSource: String,
    nativeVolume: { type: Boolean, default: false },
    rationale: String,
    literature: [{ n: Number, title: String, year: Number, url: String, distance: Number }],
    reportText: String,
    classifierBackend: String,
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

reportSchema.index({ patient: 1, createdAt: -1 });
reportSchema.index({ doctor: 1, createdAt: -1 });

module.exports = mongoose.model('Report', reportSchema);
