const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

/**
 * Verify JWT token and attach user to request
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication token required',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication token has expired',
      });
    }
    logger.warn('Invalid JWT token attempt', { error: err.message, ip: req.ip });
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid authentication token',
    });
  }
}

module.exports = { authenticateToken };
