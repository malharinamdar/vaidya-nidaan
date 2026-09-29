const jwt = require('jsonwebtoken');

// Verifies the Bearer JWT issued at login (or by the demo endpoint).
const protect = (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized — please sign in.' });
  }
  try {
    req.user = jwt.verify(header.slice(7).trim(), process.env.JWT_SECRET);
    return next();
  } catch (_err) {
    return res.status(401).json({ message: 'Session expired — please sign in again.' });
  }
};

module.exports = { protect };
