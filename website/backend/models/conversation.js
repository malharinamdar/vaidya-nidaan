const mongoose = require('mongoose');

// A saved assistant conversation — either about one patient or general (patient = null).
const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, default: '', maxlength: 12000 },
    image: { type: String, maxlength: 120000 }, // small JPEG thumbnail (data URL) of an attached image
    sources: [{ _id: false, n: Number, title: String, year: Number, url: String }],
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } }
);

const conversationSchema = new mongoose.Schema(
  {
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
    title: { type: String, trim: true, maxlength: 120, default: 'New conversation' },
    messages: { type: [messageSchema], default: [] },
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

conversationSchema.index({ doctor: 1, patient: 1, updatedAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
