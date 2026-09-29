const express = require('express');
const mongoose = require('mongoose');
const Report = require('../models/report');
const Patient = require('../models/patient');
const { protect } = require('../middleware/middleware');

const router = express.Router();
router.use(protect);

// Recent reports across all of the doctor's patients (dashboard activity feed).
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 8, 50);
    const reports = await Report.find({ doctor: req.user.doctorId })
      .select('patient patientSnapshot prediction createdAt scanName')
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json({ reports });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load reports.' });
  }
});

// One full report (with images) — used by the printable report view.
router.get('/:reportId', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.reportId)) {
    return res.status(400).json({ message: 'Invalid report id.' });
  }
  try {
    const report = await Report.findOne({ _id: req.params.reportId, doctor: req.user.doctorId });
    if (!report) return res.status(404).json({ message: 'Report not found.' });
    res.json({ report });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load the report.' });
  }
});

router.delete('/:reportId', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.reportId)) {
    return res.status(400).json({ message: 'Invalid report id.' });
  }
  try {
    const report = await Report.findOneAndDelete({ _id: req.params.reportId, doctor: req.user.doctorId });
    if (!report) return res.status(404).json({ message: 'Report not found.' });
    // Keep the patient's "latest result" pointing at their newest remaining report.
    const newest = await Report.findOne({ patient: report.patient }).sort({ createdAt: -1 });
    await Patient.updateOne(
      { _id: report.patient },
      newest
        ? { latestResult: { label: newest.prediction.label, probability: newest.prediction.probability, analyzedAt: newest.createdAt, report: newest._id } }
        : { $unset: { latestResult: 1 } }
    );
    res.json({ message: 'Report deleted.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not delete the report.' });
  }
});

module.exports = router;
