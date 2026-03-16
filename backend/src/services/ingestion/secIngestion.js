const axios = require('axios');
const { query } = require('../../config/database');
const { processDataForSignals } = require('../signalEngine');
const { retryWithBackoff } = require('../../utils/retry');
const logger = require('../../utils/logger');

const SEC_EDGAR_BASE = 'https://efts.sec.gov/LATEST/search-index';
const SEC_FULL_TEXT = 'https://efts.sec.gov/LATEST/search-index';
const SEC_COMPANY_SEARCH = 'https://www.sec.gov/cgi-bin/browse-edgar';

// Policy-relevant form types to monitor
const RELEVANT_FORM_TYPES = ['8-K', '10-K', '10-Q', 'DEF 14A', 'S-1', '6-K'];

// Keywords to search for in SEC filings
const POLICY_SEARCH_TERMS = [
  'defense contract',
  'government contract',
  'drug pricing',
  'FDA approval',
  'Medicare reimbursement',
  'energy regulation',
  'EPA compliance',
  'renewable energy credit',
  'government shutdown',
  'federal regulation',
];

/**
 * Search SEC EDGAR full-text search for policy-relevant filings
 */
async function searchSecFilings(searchTerm, limit = 10) {
  return retryWithBackoff(
    async () => {
      const response = await axios.get('https://efts.sec.gov/LATEST/search-index', {
        params: {
          q: `"${searchTerm}"`,
          dateRange: 'custom',
          startdt: getDateDaysAgo(1),
          enddt: new Date().toISOString().split('T')[0],
          forms: RELEVANT_FORM_TYPES.join(','),
          hits: { hits: { total: { value: 0, relation: 'eq' }, hits: [] } },
        },
        headers: {
          'User-Agent': 'Monument Markets info@monumentmarkets.com',
          Accept: 'application/json',
        },
        timeout: 15000,
      });
      return response.data?.hits?.hits || [];
    },
    3,
    1000,
    `SEC EDGAR search: ${searchTerm}`
  );
}

/**
 * Get recent SEC filings via EDGAR full-text search API
 */
async function fetchRecentSecFilings() {
  return retryWithBackoff(
    async () => {
      const response = await axios.get('https://efts.sec.gov/LATEST/search-index', {
        params: {
          q: 'defense OR "drug pricing" OR "energy regulation" OR "government contract" OR "FDA" OR "renewable energy"',
          dateRange: 'custom',
          startdt: getDateDaysAgo(1),
          enddt: new Date().toISOString().split('T')[0],
          forms: '8-K,10-K',
          _source: 'file_date,entity_name,file_num,period_of_report,form_type,description',
        },
        headers: {
          'User-Agent': 'Monument Markets info@monumentmarkets.com',
          Accept: 'application/json',
        },
        timeout: 20000,
      });
      return response.data?.hits?.hits || [];
    },
    3,
    1000,
    'SEC EDGAR recent filings fetch'
  );
}

function getDateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

/**
 * Save raw SEC data to database
 */
async function saveRawData(data) {
  const result = await query(
    'INSERT INTO raw_policy_data (source, data) VALUES ($1, $2) RETURNING id',
    ['sec', JSON.stringify(data)]
  );
  return result.rows[0].id;
}

/**
 * Main ingestion function for SEC EDGAR data
 */
async function ingestSecData() {
  const logEntry = await query(
    'INSERT INTO ingestion_logs (source, status, started_at) VALUES ($1, $2, NOW()) RETURNING id',
    ['sec', 'success']
  );
  const logId = logEntry.rows[0].id;

  let recordsFetched = 0;
  let signalsCreated = 0;
  let errorMessage = null;

  try {
    logger.info('Starting SEC EDGAR data ingestion');

    const filings = await fetchRecentSecFilings();
    recordsFetched = filings.length;

    logger.info(`Fetched ${filings.length} SEC filings`);

    for (const filing of filings) {
      try {
        const source = filing._source || {};
        const enrichedFiling = {
          title: `${source.form_type || 'SEC Filing'}: ${source.entity_name || 'Unknown Company'}`,
          description: source.description || '',
          entityName: source.entity_name,
          formType: source.form_type,
          fileDate: source.file_date,
          period: source.period_of_report,
          url: filing._id ? `https://www.sec.gov/Archives/edgar/${filing._id}` : null,
          content: [source.entity_name, source.description, source.form_type].filter(Boolean).join(' '),
        };

        const rawDataId = await saveRawData(enrichedFiling);
        const signals = await processDataForSignals(rawDataId, 'sec', enrichedFiling);
        signalsCreated += signals.length;
      } catch (filingErr) {
        logger.warn('Error processing individual SEC filing', {
          error: filingErr.message,
        });
      }
    }

    await query(
      `UPDATE ingestion_logs
       SET status = $1, records_fetched = $2, signals_created = $3, completed_at = NOW()
       WHERE id = $4`,
      ['success', recordsFetched, signalsCreated, logId]
    );

    logger.info('SEC EDGAR ingestion completed', { recordsFetched, signalsCreated });
  } catch (err) {
    errorMessage = err.message;
    await query(
      `UPDATE ingestion_logs
       SET status = $1, records_fetched = $2, signals_created = $3, error_message = $4, completed_at = NOW()
       WHERE id = $5`,
      ['error', recordsFetched, signalsCreated, errorMessage, logId]
    );
    logger.error('SEC EDGAR ingestion failed', { error: err.message, stack: err.stack });
  }

  return { recordsFetched, signalsCreated, error: errorMessage };
}

module.exports = { ingestSecData };
