const { verifyToken } = require('../services/security');
const db = require('../services/db');

/**
 * Middleware: Verify user is logged in
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = header.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }

  const user = db.findOne('users', u => u.id === payload.id);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: User no longer exists' });
  }

  req.user = user;
  next();
}

/**
 * Middleware: Optional authentication (doesn't fail if guest)
 */
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.split(' ')[1];
    const payload = verifyToken(token);
    if (payload) {
      const user = db.findOne('users', u => u.id === payload.id);
      if (user) req.user = user;
    }
  }
  next();
}

/**
 * Middleware: Require one of specific roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role) && req.user.role !== 'Admin') {
      return res.status(403).json({ error: `Forbidden: Requires role [${roles.join(', ')}]` });
    }
    next();
  };
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireRole,
};
