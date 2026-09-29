const express = require('express');
const mongoose = require('mongoose');
const Patient = require('../models/patient');
const Report = require('../models/report');
const Conversation = require('../models/conversation');
const { protect } = require('../middleware/middleware');

const router = express.Router();
router.use(protect);

const EDITABLE = ['name', 'age', 'gender', 'email', 'smoker', 'alcoholConsumption', 'neurologicalCondition', 'notes', 'cognitiveTests'];

// Only whitelisted fields; '' clears an optional field (so edits can remove values).
function pickEditable(body) {
  const out = {};
  for (const key of EDITABLE) {
    if (!(key in body)) continue;
    const value = body[key];
    out[key] = value === '' ? undefined : value;
  }
  return out;
}

const validId = (id) => mongoose.Types.ObjectId.isValid(id);

async function findOwnPatient(req, res) {
  if (!validId(req.params.id)) {
    res.status(400).json({ message: 'Invalid patient id.' });
    return null;
  }
  const patient = await Patient.findOne({ _id: req.params.id, doctor: req.user.doctorId });
  if (!patient) res.status(404).json({ message: 'Patient not found.' });
  return patient;
}

function validationMessage(error) {
  if (error.name !== 'ValidationError') return null;
  return Object.values(error.errors).map((e) => e.message).join(' ');
}

// List the doctor's patients (with how many reports each has).
router.get('/', async (req, res) => {
  try {
    const doctorId = new mongoose.Types.ObjectId(req.user.doctorId);
    const [patients, counts] = await Promise.all([
      Patient.find({ doctor: doctorId }).sort({ updatedAt: -1 }),
      Report.aggregate([{ $match: { doctor: doctorId } }, { $group: { _id: '$patient', n: { $sum: 1 } } }]),
    ]);
    const byPatient = Object.fromEntries(counts.map((c) => [c._id.toString(), c.n]));
    res.json({
      patients: patients.map((p) => ({ ...p.toJSON(), reportCount: byPatient[p._id.toString()] || 0 })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load patients.' });
  }
});

// Create
router.post('/', async (req, res) => {
  try {
    const patient = await Patient.create({ ...pickEditable(req.body), doctor: req.user.doctorId });
    res.status(201).json({ message: 'Patient added.', patient });
  } catch (error) {
    const msg = validationMessage(error);
    if (msg) return res.status(400).json({ message: msg });
    console.error(error);
    res.status(500).json({ message: 'Could not add the patient.' });
  }
});

// Read
router.get('/:id', async (req, res) => {
  try {
    const patient = await findOwnPatient(req, res);
    if (patient) res.json({ patient });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load the patient.' });
  }
});

// Update
router.put('/:id', async (req, res) => {
  try {
    const patient = await findOwnPatient(req, res);
    if (!patient) return;
    patient.set(pickEditable(req.body));
    await patient.save();
    res.json({ message: 'Patient updated.', patient });
  } catch (error) {
    const msg = validationMessage(error);
    if (msg) return res.status(400).json({ message: msg });
    console.error(error);
    res.status(500).json({ message: 'Could not update the patient.' });
  }
});

// Delete (and their reports + assistant conversations)
router.delete('/:id', async (req, res) => {
  try {
    const patient = await findOwnPatient(req, res);
    if (!patient) return;
    await Report.deleteMany({ patient: patient._id, doctor: req.user.doctorId });
    await Conversation.deleteMany({ patient: patient._id, doctor: req.user.doctorId });
    await patient.deleteOne();
    res.json({ message: 'Patient removed.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not delete the patient.' });
  }
});

// --- Reports ---------------------------------------------------------------

// Report history for a patient (without the heavy images).
router.get('/:id/reports', async (req, res) => {
  try {
    const patient = await findOwnPatient(req, res);
    if (!patient) return;
    const reports = await Report.find({ patient: patient._id, doctor: req.user.doctorId })
      .select('-gradcam -reportText -rationale -literature -biomarkers')
      .sort({ createdAt: -1 });
    res.json({ reports });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load reports.' });
  }
});

// Save a Full Diagnosis result (the ML service's JSON) as a report.
router.post('/:id/reports', async (req, res) => {
  try {
    const patient = await findOwnPatient(req, res);
    if (!patient) return;
    const d = req.body || {};
    const pred = d.prediction || {};
    if (!pred.prediction || typeof pred.alzheimer_probability !== 'number') {
      return res.status(400).json({ message: 'Missing prediction in the diagnosis result.' });
    }
    const gc = d.gradcam || {};
    const report = await Report.create({
      doctor: req.user.doctorId,
      patient: patient._id,
      patientSnapshot: {
        name: patient.name,
        age: patient.age,
        gender: patient.gender,
        smoker: patient.smoker,
        alcoholConsumption: patient.alcoholConsumption,
        neurologicalCondition: patient.neurologicalCondition,
      },
      scanName: d.scanName,
      prediction: {
        label: pred.prediction,
        probability: pred.alzheimer_probability,
        perClass: pred.per_class,
        threshold: typeof pred.threshold === 'number' ? pred.threshold : 50,
        message: pred.message,
      },
      gradcam: {
        overlay: gc.gradCamResult,
        original: gc.mriUrl,
        heatmap: gc.heatmapUrl,
        layer: gc.layer,
        tissueAttributionPct: gc.tissue_attribution_pct,
      },
      biomarkers: d.biomarkers,
      biomarkerSource: d.biomarker_source,
      nativeVolume: !!d.native_volume,
      rationale: d.rationale,
      literature: Array.isArray(d.literature) ? d.literature : [],
      citationCheck: d.citation_check || undefined,
      reportText: d.report,
      classifierBackend: d.classifier_backend,
    });
    patient.latestResult = {
      label: report.prediction.label,
      probability: report.prediction.probability,
      analyzedAt: report.createdAt,
      report: report._id,
    };
    await patient.save();
    res.status(201).json({ report: { id: report._id, createdAt: report.createdAt } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not save the report.' });
  }
});

module.exports = router;
