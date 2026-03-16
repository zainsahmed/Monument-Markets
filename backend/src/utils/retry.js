const logger = require('./logger');

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxAttempts - Maximum number of attempts (default: 3)
 * @param {number} baseDelayMs - Base delay in milliseconds (default: 1000)
 * @param {string} context - Description for logging
 */
async function retryWithBackoff(fn, maxAttempts = 3, baseDelayMs = 1000, context = 'operation') {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      if (attempt > 1) {
        logger.info(`${context} succeeded on attempt ${attempt}`);
      }
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        logger.warn(`${context} failed on attempt ${attempt}/${maxAttempts}. Retrying in ${delay}ms`, {
          error: err.message,
        });
        await sleep(delay);
      }
    }
  }

  logger.error(`${context} failed after ${maxAttempts} attempts`, {
    error: lastError.message,
    stack: lastError.stack,
  });
  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { retryWithBackoff, sleep };
