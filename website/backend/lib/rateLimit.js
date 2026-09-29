// Minimal in-memory, per-IP fixed-window limiter for the auth routes. Per-instance only
// (serverless instances don't share memory) — enough to blunt credential stuffing on a demo.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip;
    const now = Date.now();
    const entry = hits.get(ip);
    if (!entry || now - entry.start > windowMs) {
      hits.set(ip, { start: now, count: 1 });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({ message: 'Too many attempts. Please wait a few minutes.' });
    }
    return next();
  };
}

module.exports = { rateLimit };
