const logger = require('../utils/logger');

/**
 * Global error handling middleware
 * Converts errors to user-friendly JSON responses without exposing stack traces
 */
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;

  logger.error('Unhandled error in request', {
    method: req.method,
    path: req.path,
    statusCode,
    error: err.message,
    stack: err.stack,
  });

  // Don't expose internal details in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred. Please try again later.',
    });
  }

  return res.status(statusCode).json({
    error: err.name || 'Error',
    message: err.message || 'An error occurred',
  });
}

/**
 * Handle 404 routes
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
}

module.exports = { errorHandler, notFoundHandler };
