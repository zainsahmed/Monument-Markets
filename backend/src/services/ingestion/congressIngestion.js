const axios = require('axios');
const { query } = require('../../config/database');
const { processDataForSignals } = require('../signalEngine');
const { retryWithBackoff } = require('../../utils/retry');
const logger = require('../../utils/logger');

const CONGRESS_BASE_URL = 'https://api.congress.gov/v3';
const API_KEY = process.env.CONGRESS_API_KEY;

/**
 * Fetch recent bills from Congress.gov API
 */
async function fetchRecentBills(limit = 50) {
  if (!API_KEY) {
    logger.warn('Congress API key not configured - skipping Congress.gov ingestion');
    return [];
  }

  return retryWithBackoff(
    async () => {
      const response = await axios.get(`${CONGRESS_BASE_URL}/bill`, {
        params: {
          api_key: API_KEY,
          limit,
          sort: 'updateDate+desc',
          format: 'json',
        },
        timeout: 15000,
      });
      return response.data?.bills || [];
    },
    3,
    1000,
    'Congress.gov bills fetch'
  );
}

/**
 * Fetch bill details including summary
 */
async function fetchBillDetails(congress, billType, billNumber) {
  if (!API_KEY) return null;

  return retryWithBackoff(
    async () => {
      const response = await axios.get(
        `${CONGRESS_BASE_URL}/bill/${congress}/${billType.toLowerCase()}/${billNumber}`,
        {
          params: { api_key: API_KEY, format: 'json' },
          timeout: 15000,
        }
      );
      return response.data?.bill || null;
    },
    3,
    1000,
    `Congress.gov bill detail ${billType}${billNumber}`
  );
}

/**
 * Fetch bill summaries
 */
async function fetchBillSummaries(congress, billType, billNumber) {
  if (!API_KEY) return [];

  try {
    const response = await axios.get(
      `${CONGRESS_BASE_URL}/bill/${congress}/${billType.toLowerCase()}/${billNumber}/summaries`,
      {
        params: { api_key: API_KEY, format: 'json' },
        timeout: 10000,
      }
    );
    return response.data?.summaries || [];
  } catch {
    return []; // Summaries may not be available for all bills
  }
}

/**
 * Save raw data to database and return its ID
 */
async function saveRawData(data) {
  const result = await query(
    'INSERT INTO raw_policy_data (source, data) VALUES ($1, $2) RETURNING id',
    ['congress', JSON.stringify(data)]
  );
  return result.rows[0].id;
}

/**
 * Main ingestion function for Congress.gov data
 */
async function ingestCongressData() {
  const logEntry = await query(
    'INSERT INTO ingestion_logs (source, status, started_at) VALUES ($1, $2, NOW()) RETURNING id',
    ['congress', 'success']
  );
  const logId = logEntry.rows[0].id;

  let recordsFetched = 0;
  let signalsCreated = 0;
  let errorMessage = null;

  try {
    logger.info('Starting Congress.gov data ingestion');
    const bills = await fetchRecentBills(50);
    recordsFetched = bills.length;

    logger.info(`Fetched ${bills.length} bills from Congress.gov`);

    for (const bill of bills) {
      try {
        // Fetch detailed info and summary for each bill
        const [details, summaries] = await Promise.all([
          fetchBillDetails(bill.congress, bill.type, bill.number),
          fetchBillSummaries(bill.congress, bill.type, bill.number),
        ]);

        const enrichedBill = {
          ...bill,
          ...details,
          summary: summaries[0]?.text || details?.summary,
          congressUrl: `https://www.congress.gov/bill/${bill.congress}th-congress/${bill.type.toLowerCase()}-bill/${bill.number}`,
        };

        const rawDataId = await saveRawData(enrichedBill);
        const signals = await processDataForSignals(rawDataId, 'congress', enrichedBill);
        signalsCreated += signals.length;
      } catch (billErr) {
        logger.warn('Error processing individual bill', {
          bill: `${bill.type}${bill.number}`,
          error: billErr.message,
        });
      }
    }

    await query(
      `UPDATE ingestion_logs
       SET status = $1, records_fetched = $2, signals_created = $3, completed_at = NOW()
       WHERE id = $4`,
      ['success', recordsFetched, signalsCreated, logId]
    );

    logger.info('Congress.gov ingestion completed', { recordsFetched, signalsCreated });
  } catch (err) {
    errorMessage = err.message;
    await query(
      `UPDATE ingestion_logs
       SET status = $1, records_fetched = $2, signals_created = $3, error_message = $4, completed_at = NOW()
       WHERE id = $5`,
      ['error', recordsFetched, signalsCreated, errorMessage, logId]
    );
    logger.error('Congress.gov ingestion failed', { error: err.message, stack: err.stack });
  }

  return { recordsFetched, signalsCreated, error: errorMessage };
}

module.exports = { ingestCongressData };
