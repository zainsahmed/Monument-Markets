const { query } = require('../config/database');
const { Parser } = require('json2csv');
const logger = require('../utils/logger');

const VALID_SECTORS = ['defense', 'healthcare', 'energy'];

/**
 * GET /api/signals
 * Query params: sector, company, limit (default 50), offset (default 0), startDate, endDate
 */
async function getSignals(req, res, next) {
  try {
    const {
      sector,
      company,
      limit = 50,
      offset = 0,
      startDate,
      endDate,
      sort = 'newest',
    } = req.query;

    const parsedLimit = Math.min(parseInt(limit, 10) || 50, 500);
    const parsedOffset = parseInt(offset, 10) || 0;

    // Build dynamic WHERE clause
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (sector) {
      if (!VALID_SECTORS.includes(sector.toLowerCase())) {
        return res.status(400).json({
          error: 'Bad Request',
          message: `Invalid sector. Must be one of: ${VALID_SECTORS.join(', ')}`,
        });
      }
      conditions.push(`sector = $${paramIndex++}`);
      params.push(sector.toLowerCase());
    }

    if (company) {
      conditions.push(`affected_companies @> $${paramIndex++}::jsonb`);
      params.push(JSON.stringify([company]));
    }

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(new Date(startDate).toISOString());
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(new Date(endDate).toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = sort === 'oldest' ? 'ORDER BY created_at ASC' : 'ORDER BY created_at DESC';

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM signals ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated signals
    const signalsResult = await query(
      `SELECT id, title, description, affected_companies, sector, confidence, materiality, urgency, source, source_url, created_at
       FROM signals
       ${whereClause}
       ${orderClause}
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, parsedLimit, parsedOffset]
    );

    return res.json({
      signals: signalsResult.rows,
      pagination: {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: parsedOffset + parsedLimit < total,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/signals/:id
 */
async function getSignalById(req, res, next) {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT s.*, rpd.data as raw_data
       FROM signals s
       LEFT JOIN raw_policy_data rpd ON rpd.id = s.raw_data_id
       WHERE s.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Signal not found',
      });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/signals/stats
 * Returns signal counts per sector and recent trends
 */
async function getSignalStats(req, res, next) {
  try {
    const [sectorCounts, recentActivity, topSources] = await Promise.all([
      query(`
        SELECT sector, COUNT(*) as count,
               AVG(confidence)::numeric(10,1) as avg_confidence,
               AVG(materiality)::numeric(10,1) as avg_materiality,
               MAX(created_at) as latest_signal
        FROM signals
        GROUP BY sector
        ORDER BY count DESC
      `),
      query(`
        SELECT date_trunc('day', created_at) as date, sector, COUNT(*) as count
        FROM signals
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY 1, 2
        ORDER BY 1 DESC, 2
      `),
      query(`
        SELECT source, COUNT(*) as count
        FROM signals
        GROUP BY source
        ORDER BY count DESC
      `),
    ]);

    return res.json({
      bySector: sectorCounts.rows,
      recentActivity: recentActivity.rows,
      bySources: topSources.rows,
      totalSignals: sectorCounts.rows.reduce((sum, r) => sum + parseInt(r.count, 10), 0),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/signals/export
 * Export signals as CSV or JSON
 * Query params: format (csv|json), sector, company, startDate, endDate
 */
async function exportSignals(req, res, next) {
  try {
    const { format = 'json', sector, company, startDate, endDate } = req.query;

    if (!['csv', 'json'].includes(format.toLowerCase())) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Format must be csv or json',
      });
    }

    // Build filter
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (sector) {
      conditions.push(`sector = $${paramIndex++}`);
      params.push(sector.toLowerCase());
    }
    if (company) {
      conditions.push(`affected_companies @> $${paramIndex++}::jsonb`);
      params.push(JSON.stringify([company]));
    }
    if (startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(new Date(startDate).toISOString());
    }
    if (endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(new Date(endDate).toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT id, title, description, affected_companies, sector, confidence, materiality, urgency, source, source_url, created_at
       FROM signals
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT 10000`,
      params
    );

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `monument-signals-${timestamp}`;

    if (format.toLowerCase() === 'csv') {
      const fields = [
        { label: 'Signal ID', value: 'id' },
        { label: 'Title', value: 'title' },
        { label: 'Description', value: 'description' },
        {
          label: 'Affected Companies',
          value: (row) => (Array.isArray(row.affected_companies) ? row.affected_companies.join('; ') : ''),
        },
        { label: 'Sector', value: 'sector' },
        { label: 'Confidence (1-10)', value: 'confidence' },
        { label: 'Materiality (1-10)', value: 'materiality' },
        { label: 'Urgency (1-10)', value: 'urgency' },
        { label: 'Source', value: 'source' },
        { label: 'Source URL', value: 'source_url' },
        { label: 'Timestamp', value: 'created_at' },
      ];

      const parser = new Parser({ fields });
      const csv = parser.parse(result.rows);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      return res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      return res.json({
        exportedAt: new Date().toISOString(),
        totalRecords: result.rows.length,
        filters: { sector, company, startDate, endDate },
        signals: result.rows,
      });
    }
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/ingest - Trigger manual ingestion (admin only in production)
 */
async function triggerIngestion(req, res, next) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Manual ingestion not available in production',
    });
  }

  try {
    const { runAllIngestion } = require('../services/scheduler');
    // Run async without waiting
    runAllIngestion().catch((err) =>
      logger.error('Manual ingestion error', { error: err.message })
    );

    return res.json({ message: 'Ingestion cycle started' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSignals, getSignalById, getSignalStats, exportSignals, triggerIngestion };
