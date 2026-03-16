const logger = require('../utils/logger');

/**
 * Middleware to log all incoming API requests
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, path: reqPath, ip } = req;
  const userId = req.user?.id || 'anonymous';

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;

    const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    logger[logLevel](`${method} ${reqPath} ${statusCode}`, {
      method,
      path: reqPath,
      statusCode,
      duration,
      userId,
      ip,
      userAgent: req.headers['user-agent'],
    });
  });

  next();
}

module.exports = { requestLogger };
