const express = require('express');
const Patient = require('../models/patient');
const Doctor = require('../models/doctor'); 
const { protect } = require('../middleware/middleware'); 
const router = express.Router();

// Add a new patient (Protected route)
router.post('/', protect, async (req, res) => {
  const { name, email, age, gender, brainScan, alzheimerBiomarkers, cognitiveTests } = req.body;

  try {
    const patient = new Patient({
      name,
      email,
      age,
      gender,
      brainScan,
      alzheimerBiomarkers,
      cognitiveTests,
      doctor: req.user.doctorId, 
    });

    await patient.save();

    const doctor = await Doctor.findById(req.user.doctorId);
    if (doctor) {
      doctor.patients.push(patient._id); 
      await doctor.save(); 
    }

    res.status(201).json({ message: 'Patient added successfully', patient });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while adding patient' });
  }
});

// Get all patients for the logged-in doctor (Protected route)
router.get('/', protect, async (req, res) => {
  try {
    const patients = await Patient.find({ doctor: req.user.doctorId });
    res.json(patients);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while fetching patients' });
  }
});

// Get a single patient by ID (Protected route)
const mongoose = require('mongoose');

router.get('/:id', protect, async (req, res) => {
  const { id } = req.params;
  console.log('Request Params:', req.params); // Debugging
  console.log('Request Params ID:', req.params.id); // Debugging

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid Patient ID' });
  }

  try {
    const patient = await Patient.findOne({ _id: id, doctor: req.user.doctorId });

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    res.json(patient);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while fetching patient details' });
  }
});

// Update patient details (Protected route)
router.put('/:id', protect, async (req, res) => {
  const { name, email, age, gender, brainScan, alzheimerBiomarkers, cognitiveTests } = req.body;

  try {
    const patient = await Patient.findOne({ _id: req.params.id, doctor: req.user.doctorId });
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    patient.name = name || patient.name;
    patient.email = email || patient.email;
    patient.age = age || patient.age;
    patient.gender = gender || patient.gender;
    patient.brainScan = brainScan || patient.brainScan;
    patient.alzheimerBiomarkers = alzheimerBiomarkers || patient.alzheimerBiomarkers;
    patient.cognitiveTests = cognitiveTests || patient.cognitiveTests;

    await patient.save();
    res.json({ message: 'Patient details updated successfully', patient });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while updating patient' });
  }
});

// Delete a patient (Protected route)
router.delete('/:id', protect, async (req, res) => {
  try {
    const patient = await Patient.findOne({ _id: req.params.id, doctor: req.user.doctorId });
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // Remove the patient reference from the associated doctor's patients array
    const doctor = await Doctor.findById(req.user.doctorId);
    if (doctor) {
      doctor.patients.pull(patient._id); // Remove the patient ID from the doctor's patients array
      await doctor.save();
    }

    // Remove the patient from the database
    await patient.deleteOne();
    res.json({ message: 'Patient removed successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while deleting patient' });
  }
});

// Brain tumor and Alzheimer’s detection (Protected route)
router.post('/:id/detection', protect, async (req, res) => {
  const { brainTumorModelData, alzheimerModelData } = req.body;

  try {
    const patient = await Patient.findOne({ _id: req.params.id, doctor: req.user.doctorId });
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const brainTumorResult = brainTumorModelData ? 'Tumor Detected' : 'No Tumor Detected';
    const alzheimerResult = alzheimerModelData ? 'Alzheimer’s Risk Detected' : 'No Alzheimer’s Risk';

    res.json({
      message: 'Detection complete',
      brainTumorResult,
      alzheimerResult,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during detection' });
  }
});

module.exports = router;
