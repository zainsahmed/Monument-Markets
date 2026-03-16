const express = require('express');
const router = express.Router();
const {
  getSignals,
  getSignalById,
  getSignalStats,
  exportSignals,
  triggerIngestion,
} = require('../controllers/signalsController');
const { authenticateToken } = require('../middleware/auth');

// All signal routes require authentication
router.use(authenticateToken);

/**
 * @route GET /api/signals/stats
 * @desc Get signal statistics and counts per sector
 * @access Private
 */
router.get('/stats', getSignalStats);

/**
 * @route GET /api/signals/export
 * @desc Export signals as CSV or JSON
 * @access Private
 * @query format=csv|json, sector, company, startDate, endDate
 */
router.get('/export', exportSignals);

/**
 * @route GET /api/signals
 * @desc Get list of signals with filtering and pagination
 * @access Private
 * @query sector, company, limit, offset, startDate, endDate, sort
 */
router.get('/', getSignals);

/**
 * @route GET /api/signals/:id
 * @desc Get a single signal by ID
 * @access Private
 */
router.get('/:id', getSignalById);

/**
 * @route POST /api/admin/ingest
 * @desc Trigger manual data ingestion (development only)
 * @access Private
 */
router.post('/admin/ingest', triggerIngestion);

module.exports = router;
