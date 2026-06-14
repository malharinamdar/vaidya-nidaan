const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
}, {
  timestamps: true,
  toJSON: {
    transform(_doc, ret) {
      ret.id = ret._id; // expose `id` for the frontend
      delete ret.__v;
      return ret;
    },
  },
});

// Compare passwords during login (using bcryptjs)
doctorSchema.methods.matchPassword = async function (password) {
  try {
    const match = await bcrypt.compare(password, this.password);
    return match;  // Return true if passwords match, else false
  } catch (error) {
    console.error('Error comparing passwords:', error);
    return false;  // In case of error, return false
  }
};

module.exports = mongoose.model('Doctor', doctorSchema);
