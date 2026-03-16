const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle database client', { error: err.message, stack: err.stack });
});

pool.on('connect', () => {
  logger.debug('New database connection established');
});

/**
 * Execute a query with optional parameters
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { text: text.substring(0, 100), duration, rows: res.rowCount });
    return res;
  } catch (err) {
    logger.error('Database query error', { text: text.substring(0, 100), error: err.message });
    throw err;
  }
}

/**
 * Get a client from the pool for transactions
 */
async function getClient() {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  const release = client.release.bind(client);

  // Override release to log any clients that are released without being properly closed
  const timeout = setTimeout(() => {
    logger.warn('A client has been checked out for more than 5 seconds!');
  }, 5000);

  client.release = () => {
    clearTimeout(timeout);
    return release();
  };

  return client;
}

module.exports = { query, getClient, pool };
