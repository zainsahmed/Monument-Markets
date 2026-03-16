const express = require('express');
const router = express.Router();
const { signup, login, getMe } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

/**
 * @route POST /auth/signup
 * @desc Register a new user
 * @access Public
 */
router.post('/signup', signup);

/**
 * @route POST /auth/login
 * @desc Login and receive JWT token
 * @access Public
 */
router.post('/login', login);

/**
 * @route GET /auth/me
 * @desc Get current user profile
 * @access Private
 */
router.get('/me', authenticateToken, getMe);

module.exports = router;
