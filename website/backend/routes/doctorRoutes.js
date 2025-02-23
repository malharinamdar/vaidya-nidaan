const express = require('express');
const Doctor = require('../models/doctor');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { protect } = require('../middleware/middleware');
const router = express.Router();

// Register a new doctor
router.post('/signup', async (req, res) => {
  const { name, email, password, specialty } = req.body;
  
  try {
    // Check if doctor already exists
    const doctorExists = await Doctor.findOne({ email });
    if (doctorExists) {
      return res.status(400).json({ message: 'Doctor already exists' });
    }


    
    // Create and save the new doctor
    const doctor = new Doctor({
      name,
      email,
      password: password,
      specialty,
    });

    await doctor.save();
    
    res.status(201).json({ message: 'Doctor registered successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login doctor
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const doctor = await Doctor.findOne({ email });
    if (!doctor) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await doctor.matchPassword(password); 
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { doctorId: doctor._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Get doctor profile (Protected route)
router.get('/profile', protect, async (req, res) => {
  try {
      const doctor = await Doctor.findById(req.user.doctorId).select('-password');
      
      if (!doctor) {
          return res.status(404).json({ message: 'Doctor not found' });
      }
      
      res.json(doctor);
  } catch (error) {
      console.error('Error in profile route:', error);
      res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
