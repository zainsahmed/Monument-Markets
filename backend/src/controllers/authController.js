const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = '24h';

/**
 * POST /auth/signup
 */
async function signup(req, res, next) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Email and password are required',
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid email format',
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Password must be at least 8 characters',
    });
  }

  try {
    // Check if email already exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'An account with this email already exists',
      });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email.toLowerCase(), passwordHash]
    );

    const user = result.rows[0];

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    logger.info('New user registered', { userId: user.id, email: user.email });

    return res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/login
 */
async function login(req, res, next) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Email and password are required',
    });
  }

  try {
    const result = await query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      logger.warn('Failed login attempt', { email: user.email });
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    // Update updated_at
    await query('UPDATE users SET updated_at = NOW() WHERE id = $1', [user.id]);

    logger.info('User logged in', { userId: user.id });

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /auth/me - Get current user info
 */
async function getMe(req, res, next) {
  try {
    const result = await query(
      'SELECT id, email, created_at, updated_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }

    const user = result.rows[0];
    return res.json({
      id: user.id,
      email: user.email,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { signup, login, getMe };
