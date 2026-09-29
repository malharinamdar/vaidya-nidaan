const express = require('express');
const mongoose = require('mongoose');
const Conversation = require('../models/conversation');
const Patient = require('../models/patient');
const { protect } = require('../middleware/middleware');

const router = express.Router();
router.use(protect);

const MAX_MESSAGES = 200;
const validId = (id) => mongoose.Types.ObjectId.isValid(id);

// Accept only well-formed messages; thumbnails must be small image data URLs.
function cleanMessages(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({
      role: m.role,
      content: String(m.content || '').slice(0, 12000),
      image:
        typeof m.image === 'string' && m.image.startsWith('data:image/') && m.image.length <= 120000
          ? m.image
          : undefined,
      sources: Array.isArray(m.sources)
        ? m.sources.slice(0, 8).map((s) => ({ n: s.n, title: String(s.title || '').slice(0, 400), year: s.year, url: s.url }))
        : [],
    }))
    .filter((m) => m.content || m.image);
}

async function findOwn(req, res) {
  if (!validId(req.params.id)) {
    res.status(400).json({ message: 'Invalid conversation id.' });
    return null;
  }
  const convo = await Conversation.findOne({ _id: req.params.id, doctor: req.user.doctorId });
  if (!convo) res.status(404).json({ message: 'Conversation not found.' });
  return convo;
}

// List conversations: ?patient=<id> for a patient's chats, ?patient=general for the general assistant.
router.get('/', async (req, res) => {
  try {
    const scope = req.query.patient;
    const match = { doctor: new mongoose.Types.ObjectId(req.user.doctorId) };
    if (scope === 'general') match.patient = null;
    else if (scope && validId(scope)) match.patient = new mongoose.Types.ObjectId(scope);
    const convos = await Conversation.aggregate([
      { $match: match },
      { $sort: { updatedAt: -1 } },
      { $limit: 40 },
      { $project: { title: 1, patient: 1, updatedAt: 1, createdAt: 1, messageCount: { $size: '$messages' } } },
    ]);
    res.json({ conversations: convos.map((c) => ({ ...c, id: c._id })) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load conversations.' });
  }
});

// Start a conversation (optionally about a patient the doctor owns).
router.post('/', async (req, res) => {
  try {
    let patient = null;
    if (req.body.patient) {
      if (!validId(req.body.patient)) return res.status(400).json({ message: 'Invalid patient id.' });
      const owned = await Patient.exists({ _id: req.body.patient, doctor: req.user.doctorId });
      if (!owned) return res.status(404).json({ message: 'Patient not found.' });
      patient = req.body.patient;
    }
    const convo = await Conversation.create({
      doctor: req.user.doctorId,
      patient,
      title: String(req.body.title || 'New conversation').slice(0, 120),
      messages: cleanMessages(req.body.messages),
    });
    res.status(201).json({ conversation: convo });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not start the conversation.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const convo = await findOwn(req, res);
    if (convo) res.json({ conversation: convo });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load the conversation.' });
  }
});

// Append messages (the user's turn + the assistant's reply).
router.post('/:id/messages', async (req, res) => {
  try {
    const convo = await findOwn(req, res);
    if (!convo) return;
    const msgs = cleanMessages(req.body.messages);
    if (!msgs.length) return res.status(400).json({ message: 'No valid messages.' });
    convo.messages.push(...msgs);
    if (convo.messages.length > MAX_MESSAGES) convo.messages = convo.messages.slice(-MAX_MESSAGES);
    await convo.save();
    res.json({ ok: true, messageCount: convo.messages.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not save the messages.' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const convo = await findOwn(req, res);
    if (!convo) return;
    if (req.body.title) convo.title = String(req.body.title).slice(0, 120);
    await convo.save();
    res.json({ conversation: { id: convo._id, title: convo.title } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not rename the conversation.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const convo = await findOwn(req, res);
    if (!convo) return;
    await convo.deleteOne();
    res.json({ message: 'Conversation deleted.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not delete the conversation.' });
  }
});

module.exports = router;
