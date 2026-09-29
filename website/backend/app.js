// Express app (no listen) — shared by server.js (local) and api/index.js (Vercel).
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { connectDatabase } = require('./lib/db');
const doctorRoutes = require('./routes/doctorRoutes');
const patientRoutes = require('./routes/patientRoutes');
const reportRoutes = require('./routes/reportRoutes');
const conversationRoutes = require('./routes/conversationRoutes');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set (see website/backend/.env.example).');
}

const app = express();
app.disable('x-powered-by');

// Comma-separated allow-list, e.g. "https://vaidya-nidaan.vercel.app"; open when unset (local dev).
const origins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors(origins.length ? { origin: origins } : {}));
app.use(express.json({ limit: '4mb' })); // saved reports carry the Grad-CAM PNGs; chats carry thumbnails

app.get(['/', '/health'], (_req, res) => {
  res.json({ status: 'ok', service: 'vaidya-nidaan-api' });
});

// Every /api route needs the database; connect lazily (cached across requests).
app.use('/api', async (_req, res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (err) {
    console.error('Database connection failed:', err.message);
    res.status(503).json({ message: 'Database unavailable. Please try again shortly.' });
  }
});

app.use('/api/doctors', doctorRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/conversations', conversationRoutes);

app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Request too large.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Malformed JSON.' });
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

module.exports = app;
