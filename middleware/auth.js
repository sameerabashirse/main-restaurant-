const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'feastflow_super_secret_jwt_key_2026';

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'Access Denied: Authentication Token Required.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Access Denied: Invalid or Expired Token.' });
  }
};

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Access Denied: Unauthenticated.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access Denied: Role '${req.user.role}' is not authorized to access this endpoint.`
      });
    }

    next();
  };
};

module.exports = {
  requireAuth,
  requireRole,
  authenticateToken: requireAuth,
  authorizeRoles: requireRole
};
