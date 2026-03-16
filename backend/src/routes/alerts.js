const express = require('express');
const router = express.Router();
const { subscribe, getAlerts, deleteAlert } = require('../controllers/alertsController');
const { authenticateToken } = require('../middleware/auth');

// All alert routes require authentication
router.use(authenticateToken);

/**
 * @route POST /api/alerts/subscribe
 * @desc Create or update email alert subscription
 * @access Private
 */
router.post('/subscribe', subscribe);

/**
 * @route GET /api/alerts
 * @desc Get user's alert subscriptions
 * @access Private
 */
router.get('/', getAlerts);

/**
 * @route DELETE /api/alerts/:id
 * @desc Deactivate an alert subscription
 * @access Private
 */
router.delete('/:id', deleteAlert);

module.exports = router;
