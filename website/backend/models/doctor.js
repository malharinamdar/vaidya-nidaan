const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const doctorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    specialty: { type: String, required: true, trim: true, maxlength: 80 },
    // The shared "Try the demo" account: tokens are issued by /api/doctors/demo,
    // its password is random and never usable for a normal login.
    isDemo: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
        delete ret.password;
        return ret;
      },
    },
  }
);

doctorSchema.methods.matchPassword = function (password) {
  return bcrypt.compare(password, this.password).catch(() => false);
};

module.exports = mongoose.model('Doctor', doctorSchema);
