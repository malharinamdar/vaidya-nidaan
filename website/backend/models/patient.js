const mongoose = require('mongoose');

const YES_NO = ['Yes', 'No'];

const patientSchema = new mongoose.Schema(
  {
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    age: { type: Number, required: true, min: 0, max: 120 },
    gender: { type: String, required: true, enum: ['Male', 'Female', 'Other'] },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },

    // Risk-factor questionnaire captured on patient creation.
    smoker: { type: String, enum: YES_NO },
    alcoholConsumption: { type: String, enum: ['Never', 'Low', 'High'] },
    neurologicalCondition: { type: String, enum: YES_NO },
    notes: { type: String, trim: true, maxlength: 2000 },

    cognitiveTests: [
      {
        testName: { type: String, trim: true }, // e.g. MMSE, MoCA
        testDate: { type: Date },
        score: { type: Number },
      },
    ],

    // Denormalised summary of the most recent diagnosis report (for the dashboard).
    latestResult: {
      label: { type: String },
      probability: { type: Number }, // model P(Demented), %
      analyzedAt: { type: Date },
      report: { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
    },
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

patientSchema.index({ doctor: 1, updatedAt: -1 });

module.exports = mongoose.model('Patient', patientSchema);
