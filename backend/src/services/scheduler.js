const cron = require('node-cron');
const logger = require('../utils/logger');
const { ingestCongressData } = require('./ingestion/congressIngestion');
const { ingestSecData } = require('./ingestion/secIngestion');
const { ingestNewsData } = require('./ingestion/newsIngestion');

/**
 * Run all ingestion sources and log results
 */
async function runAllIngestion() {
  logger.info('Starting scheduled data ingestion cycle');

  const results = await Promise.allSettled([
    ingestCongressData(),
    ingestSecData(),
    ingestNewsData(),
  ]);

  results.forEach((result, i) => {
    const sources = ['Congress.gov', 'SEC EDGAR', 'NewsAPI'];
    if (result.status === 'fulfilled') {
      logger.info(`${sources[i]} ingestion completed`, result.value);
    } else {
      logger.error(`${sources[i]} ingestion rejected`, { error: result.reason?.message });
    }
  });

  logger.info('Scheduled data ingestion cycle complete');
}

/**
 * Start the data ingestion scheduler
 * Congress: every 6 hours
 * SEC: daily at midnight
 * News: every hour
 */
function startScheduler() {
  logger.info('Initializing data ingestion scheduler');

  // News: every hour
  cron.schedule('0 * * * *', async () => {
    logger.info('Running scheduled NewsAPI ingestion');
    try {
      await ingestNewsData();
    } catch (err) {
      logger.error('Scheduled NewsAPI ingestion failed', { error: err.message });
    }
  });

  // Congress: every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    logger.info('Running scheduled Congress.gov ingestion');
    try {
      await ingestCongressData();
    } catch (err) {
      logger.error('Scheduled Congress.gov ingestion failed', { error: err.message });
    }
  });

  // SEC EDGAR: daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    logger.info('Running scheduled SEC EDGAR ingestion');
    try {
      await ingestSecData();
    } catch (err) {
      logger.error('Scheduled SEC EDGAR ingestion failed', { error: err.message });
    }
  });

  logger.info('Scheduler started: News (hourly), Congress (6h), SEC (daily at 2AM)');
}

module.exports = { startScheduler, runAllIngestion };
