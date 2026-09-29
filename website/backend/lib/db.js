const mongoose = require('mongoose');

// One cached connection per process. On Vercel each warm serverless instance reuses it
// instead of opening a new pool per request.
let cached = global.__vnMongo || (global.__vnMongo = { conn: null, promise: null, memory: null });

async function connectDatabase() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = (async () => {
      let uri = process.env.MONGO_URI;
      if (!uri) {
        // Zero-setup local dev: an ephemeral in-memory MongoDB (never used in production).
        const { MongoMemoryServer } = require('mongodb-memory-server-core');
        console.log('No MONGO_URI set — starting in-memory MongoDB (data is not persisted)...');
        cached.memory = await MongoMemoryServer.create();
        uri = cached.memory.getUri();
      }
      await mongoose.connect(uri, {
        dbName: process.env.MONGO_DB_NAME || 'vaidya_nidaan',
        serverSelectionTimeoutMS: 10000,
        maxPoolSize: 5,
      });
      console.log(`MongoDB connected (db: ${mongoose.connection.name})`);
      return mongoose.connection;
    })().catch((err) => {
      cached.promise = null; // let the next request retry
      throw err;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = { connectDatabase };
