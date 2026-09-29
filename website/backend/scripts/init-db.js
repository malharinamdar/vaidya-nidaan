// Initialise the MongoDB database: create the collections, build every index declared
// in the Mongoose schemas, and (with DEMO_MODE=true) seed the demo workspace.
//   npm run init-db
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDatabase } = require('../lib/db');
const Doctor = require('../models/doctor');
const Patient = require('../models/patient');
const Report = require('../models/report');
const Conversation = require('../models/conversation');
const { ensureDemoWorkspace } = require('../lib/demo');

(async () => {
  await connectDatabase();
  for (const model of [Doctor, Patient, Report, Conversation]) {
    await model.createCollection();
    await model.syncIndexes();
    const idx = await model.collection.indexes();
    console.log(`${model.collection.name}: ${idx.map((i) => i.name).join(', ')}`);
  }
  if (process.env.DEMO_MODE === 'true') {
    const demo = await ensureDemoWorkspace();
    const n = await Patient.countDocuments({ doctor: demo._id });
    console.log(`demo workspace ready: ${demo.email} with ${n} patients`);
  }
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
