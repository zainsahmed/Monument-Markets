const axios = require('axios');
const { query } = require('../../config/database');
const { processDataForSignals } = require('../signalEngine');
const { retryWithBackoff } = require('../../utils/retry');
const logger = require('../../utils/logger');

const NEWS_API_BASE = 'https://newsapi.org/v2';
const API_KEY = process.env.NEWS_API_KEY;

// Search queries for policy-relevant news
const POLICY_QUERIES = [
  'defense spending legislation congress',
  'military budget bill pentagon',
  'drug pricing healthcare policy congress',
  'FDA pharmaceutical regulation',
  'Medicare Medicaid policy change',
  'energy subsidy renewable legislation',
  'oil gas regulation EPA climate',
  'defense contract procurement DoD',
];

/**
 * Fetch policy-relevant news articles
 */
async function fetchPolicyNews(query_str, pageSize = 20) {
  if (!API_KEY) {
    logger.warn('NewsAPI key not configured - skipping news ingestion');
    return [];
  }

  return retryWithBackoff(
    async () => {
      const response = await axios.get(`${NEWS_API_BASE}/everything`, {
        params: {
          q: query_str,
          language: 'en',
          sortBy: 'publishedAt',
          pageSize,
          from: getDateDaysAgo(0.5), // Last 12 hours
          apiKey: API_KEY,
        },
        timeout: 15000,
      });
      return response.data?.articles || [];
    },
    3,
    1000,
    `NewsAPI fetch: ${query_str.substring(0, 50)}`
  );
}

/**
 * Fetch top headlines for policy topics
 */
async function fetchPolicyHeadlines() {
  if (!API_KEY) return [];

  return retryWithBackoff(
    async () => {
      const response = await axios.get(`${NEWS_API_BASE}/top-headlines`, {
        params: {
          country: 'us',
          category: 'business',
          pageSize: 40,
          apiKey: API_KEY,
        },
        timeout: 15000,
      });
      return response.data?.articles || [];
    },
    3,
    1000,
    'NewsAPI top headlines fetch'
  );
}

function getDateDaysAgo(days) {
  const date = new Date();
  date.setTime(date.getTime() - days * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

/**
 * Save raw news data to database
 */
async function saveRawData(data) {
  const result = await query(
    'INSERT INTO raw_policy_data (source, data) VALUES ($1, $2) RETURNING id',
    ['news', JSON.stringify(data)]
  );
  return result.rows[0].id;
}

/**
 * Deduplicate articles by URL
 */
function deduplicateArticles(articles) {
  const seen = new Set();
  return articles.filter((article) => {
    if (!article.url || seen.has(article.url)) return false;
    seen.add(article.url);
    return true;
  });
}

/**
 * Main ingestion function for NewsAPI data
 */
async function ingestNewsData() {
  const logEntry = await query(
    'INSERT INTO ingestion_logs (source, status, started_at) VALUES ($1, $2, NOW()) RETURNING id',
    ['news', 'success']
  );
  const logId = logEntry.rows[0].id;

  let recordsFetched = 0;
  let signalsCreated = 0;
  let errorMessage = null;

  try {
    logger.info('Starting NewsAPI data ingestion');

    // Fetch from multiple query terms + headlines
    const allArticles = [];

    // Fetch top headlines
    const headlines = await fetchPolicyHeadlines();
    allArticles.push(...headlines);

    // Fetch targeted queries (run in parallel, limit to 3 at a time)
    const queryBatches = [];
    for (let i = 0; i < POLICY_QUERIES.length; i += 3) {
      queryBatches.push(POLICY_QUERIES.slice(i, i + 3));
    }

    for (const batch of queryBatches) {
      const results = await Promise.all(batch.map((q) => fetchPolicyNews(q)));
      results.forEach((articles) => allArticles.push(...articles));
    }

    const uniqueArticles = deduplicateArticles(allArticles);
    recordsFetched = uniqueArticles.length;

    logger.info(`Processing ${uniqueArticles.length} unique news articles`);

    for (const article of uniqueArticles) {
      try {
        const enrichedArticle = {
          title: article.title,
          description: article.description,
          content: article.content,
          url: article.url,
          source: article.source?.name,
          publishedAt: article.publishedAt,
          author: article.author,
        };

        const rawDataId = await saveRawData(enrichedArticle);
        const signals = await processDataForSignals(rawDataId, 'news', enrichedArticle);
        signalsCreated += signals.length;
      } catch (articleErr) {
        logger.warn('Error processing individual news article', {
          title: article.title,
          error: articleErr.message,
        });
      }
    }

    await query(
      `UPDATE ingestion_logs
       SET status = $1, records_fetched = $2, signals_created = $3, completed_at = NOW()
       WHERE id = $4`,
      ['success', recordsFetched, signalsCreated, logId]
    );

    logger.info('NewsAPI ingestion completed', { recordsFetched, signalsCreated });
  } catch (err) {
    errorMessage = err.message;
    await query(
      `UPDATE ingestion_logs
       SET status = $1, records_fetched = $2, signals_created = $3, error_message = $4, completed_at = NOW()
       WHERE id = $5`,
      ['error', recordsFetched, signalsCreated, errorMessage, logId]
    );
    logger.error('NewsAPI ingestion failed', { error: err.message, stack: err.stack });
  }

  return { recordsFetched, signalsCreated, error: errorMessage };
}

module.exports = { ingestNewsData };
