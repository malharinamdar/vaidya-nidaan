// Local entrypoint: `npm start`. (On Vercel, api/index.js exports the same app.)
const app = require('./app');
const { connectDatabase } = require('./lib/db');

const PORT = process.env.PORT || 5005;

connectDatabase()
  .then(() => {
    app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
