const mongoose = require('mongoose');

// Doctor Schema
const doctorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  specialty: {
    type: String,
    required: true,
  },
  // Add any other doctor-specific fields here

  // This will automatically be populated with the doctor's patients (optional)
  patients: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient', // Reference to the Patient model
    },
  ],
});

// Compare passwords during login (No hashing)
doctorSchema.methods.matchPassword = async function (password) {
  try {
    console.log("Password to compare:", password);  // Log the password being compared
    console.log("Stored Password in DB:", this.password);  // Log the stored password in DB

    // Directly compare the input password with the stored password in DB (no hashing)
    const match = password === this.password;
    console.log("Password Comparison Result:", match);  // Log the comparison result

    return match;  // Return true if passwords match, else false
  } catch (error) {
    console.error('Error comparing passwords:', error);
    return false;  // In case of error, return false
  }
};

module.exports = mongoose.model('Doctor', doctorSchema);
