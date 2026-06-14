// Load environment variables before anything else.
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const doctorAuthRoutes = require('./routes/doctorRoutes');
const patientRoutes = require('./routes/patientRoutes');

const app = express();

app.use(cors());
app.use(express.json());

// Health check (handy for verifying the gateway is up).
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'vaidya-nidaan-backend' });
});

// Mount routes under BOTH the plural names the frontend uses and the original
// singular names, so either convention works.
app.use('/api/doctors', doctorAuthRoutes);
app.use('/api/doctor', doctorAuthRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/patient', patientRoutes);

const PORT = process.env.PORT || 5005;

// Connect to MongoDB. If MONGO_URI is not provided, spin up an ephemeral
// in-memory MongoDB so the app runs with zero external setup.
async function connectDatabase() {
  let uri = process.env.MONGO_URI;

  if (!uri) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    console.log('No MONGO_URI set — starting in-memory MongoDB (data is not persisted)...');
    const mem = await MongoMemoryServer.create();
    uri = mem.getUri();
    // Keep a reference so the process can stop it on shutdown.
    app.locals.mongoMemoryServer = mem;
  }

  await mongoose.connect(uri);
  console.log('MongoDB connected');
}

connectDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
