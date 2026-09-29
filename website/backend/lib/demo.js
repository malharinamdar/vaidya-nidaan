const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Doctor = require('../models/doctor');
const Patient = require('../models/patient');

const DEMO_EMAIL = 'demo@vaidya-nidaan.app';

// Fictional patients for the public demo workspace.
const DEMO_PATIENTS = [
  { name: 'Sunita Rao', age: 74, gender: 'Female', smoker: 'No', alcoholConsumption: 'Never', neurologicalCondition: 'No',
    notes: 'Family reports increasing forgetfulness over 18 months. MMSE 24/30.' },
  { name: 'Vikram Joshi', age: 69, gender: 'Male', smoker: 'Yes', alcoholConsumption: 'Low', neurologicalCondition: 'No',
    notes: 'Routine screening; hypertension, controlled.' },
  { name: 'Meera Iyer', age: 78, gender: 'Female', smoker: 'No', alcoholConsumption: 'Low', neurologicalCondition: 'Yes',
    notes: 'Prior TIA (2023). Word-finding difficulty.' },
  { name: 'Arjun Patil', age: 71, gender: 'Male', smoker: 'No', alcoholConsumption: 'High', neurologicalCondition: 'No',
    notes: 'Self-referred for memory concerns.' },
];

// Idempotent: creates the demo doctor once and tops the workspace back up to the
// fictional patients if visitors deleted them.
async function ensureDemoWorkspace() {
  let doctor = await Doctor.findOne({ email: DEMO_EMAIL });
  if (!doctor) {
    const unusablePassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    doctor = await Doctor.create({
      name: 'Demo Clinician',
      email: DEMO_EMAIL,
      password: unusablePassword,
      specialty: 'Neurologist',
      isDemo: true,
    });
  }
  const existing = await Patient.find({ doctor: doctor._id }).select('name').lean();
  const have = new Set(existing.map((p) => p.name));
  const missing = DEMO_PATIENTS.filter((p) => !have.has(p.name));
  if (missing.length) {
    await Patient.insertMany(missing.map((p) => ({ ...p, doctor: doctor._id })));
  }
  return doctor;
}

module.exports = { ensureDemoWorkspace, DEMO_EMAIL };
