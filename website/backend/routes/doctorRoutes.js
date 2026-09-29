const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Doctor = require('../models/doctor');
const { protect } = require('../middleware/middleware');
const { ensureDemoWorkspace } = require('../lib/demo');
const { rateLimit } = require('../lib/rateLimit');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

const sign = (doctor, extra = {}, expiresIn = '7d') =>
  jwt.sign({ doctorId: doctor._id.toString(), ...extra }, process.env.JWT_SECRET, { expiresIn });

// Register a new doctor
router.post('/signup', authLimit, async (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const specialty = (req.body.specialty || '').trim();

  if (!name || !specialty) return res.status(400).json({ message: 'Name and specialty are required.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });

  try {
    if (await Doctor.exists({ email })) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }
    const doctor = await Doctor.create({ name, email, specialty, password: await bcrypt.hash(password, 10) });
    return res.status(201).json({ message: 'Account created.', token: sign(doctor), doctor });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ message: 'Could not create the account. Please try again.' });
  }
});

// Login
router.post('/login', authLimit, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  try {
    const doctor = await Doctor.findOne({ email });
    if (!doctor || doctor.isDemo || !(await doctor.matchPassword(password))) {
      return res.status(401).json({ message: 'Incorrect email or password.' });
    }
    return res.json({ token: sign(doctor), doctor });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Could not sign in. Please try again.' });
  }
});

// One-click demo workspace (shared, fictional patients). Enabled with DEMO_MODE=true.
router.post('/demo', authLimit, async (_req, res) => {
  if (process.env.DEMO_MODE !== 'true') {
    return res.status(404).json({ message: 'Demo mode is disabled.' });
  }
  try {
    const doctor = await ensureDemoWorkspace();
    return res.json({ token: sign(doctor, { demo: true }, '12h'), doctor });
  } catch (error) {
    console.error('Demo error:', error);
    return res.status(500).json({ message: 'Could not open the demo workspace.' });
  }
});

// Current doctor
router.get('/profile', protect, async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.user.doctorId);
    if (!doctor) return res.status(404).json({ message: 'Account not found.' });
    return res.json(doctor);
  } catch (error) {
    console.error('Profile error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
