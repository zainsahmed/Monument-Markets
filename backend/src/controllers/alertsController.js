const { query } = require('../config/database');
const logger = require('../utils/logger');

const VALID_SECTORS = ['defense', 'healthcare', 'energy'];

/**
 * POST /api/alerts/subscribe
 * Create or update alert subscription for the authenticated user
 */
async function subscribe(req, res, next) {
  const { sectors = [], companies = [] } = req.body;
  const userId = req.user.id;

  // Validate sectors
  const invalidSectors = sectors.filter((s) => !VALID_SECTORS.includes(s.toLowerCase()));
  if (invalidSectors.length > 0) {
    return res.status(400).json({
      error: 'Bad Request',
      message: `Invalid sectors: ${invalidSectors.join(', ')}. Valid: ${VALID_SECTORS.join(', ')}`,
    });
  }

  if (!Array.isArray(companies)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'companies must be an array',
    });
  }

  try {
    // Upsert: update existing or create new
    const existing = await query(
      'SELECT id FROM email_alerts WHERE user_id = $1',
      [userId]
    );

    let result;
    if (existing.rows.length > 0) {
      result = await query(
        `UPDATE email_alerts
         SET sectors = $1, companies = $2, is_active = TRUE, updated_at = NOW()
         WHERE user_id = $3
         RETURNING *`,
        [JSON.stringify(sectors.map((s) => s.toLowerCase())), JSON.stringify(companies), userId]
      );
    } else {
      result = await query(
        `INSERT INTO email_alerts (user_id, sectors, companies)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [userId, JSON.stringify(sectors.map((s) => s.toLowerCase())), JSON.stringify(companies)]
      );
    }

    logger.info('Alert subscription updated', {
      userId,
      sectors,
      companies: companies.length,
    });

    return res.status(existing.rows.length > 0 ? 200 : 201).json({
      message: 'Alert preferences saved successfully',
      alert: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/alerts
 * Get current user's alert subscriptions
 */
async function getAlerts(req, res, next) {
  const userId = req.user.id;

  try {
    const result = await query(
      'SELECT * FROM email_alerts WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    return res.json({
      alerts: result.rows,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/alerts/:id
 * Deactivate an alert subscription
 */
async function deleteAlert(req, res, next) {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const result = await query(
      'UPDATE email_alerts SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Alert subscription not found',
      });
    }

    return res.json({ message: 'Alert subscription deactivated' });
  } catch (err) {
    next(err);
  }
}

module.exports = { subscribe, getAlerts, deleteAlert };
