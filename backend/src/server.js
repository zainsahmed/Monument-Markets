require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const logger = require('./utils/logger');
const { runMigrations } = require('./config/migrate');
const { startScheduler } = require('./services/scheduler');
const { requestLogger } = require('./middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Routes
const authRoutes = require('./routes/auth');
const signalsRoutes = require('./routes/signals');
const alertsRoutes = require('./routes/alerts');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Rate limit exceeded, please try again later' },
});
app.use('/api', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too Many Requests', message: 'Too many auth attempts' },
});
app.use('/auth', authLimiter);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request logging
app.use(requestLogger);

// Health check (no auth required)
app.get('/health', async (req, res) => {
  const { pool } = require('./config/database');
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      version: '1.0.0',
    });
  } catch {
    res.status(503).json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
    });
  }
});

// Ingestion trigger (dev only, no auth for convenience in testing)
app.post('/admin/ingest', async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const { runAllIngestion } = require('./services/scheduler');
    runAllIngestion().catch((err) =>
      logger.error('Manual ingestion error', { error: err.message })
    );
    return res.json({ message: 'Ingestion started asynchronously' });
  } catch (err) {
    next(err);
  }
});

// API Routes
app.use('/auth', authRoutes);
app.use('/api/signals', signalsRoutes);
app.use('/api/alerts', alertsRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Initialize application
async function init() {
  try {
    logger.info('Starting Monument Markets API server...');

    // Run database migrations
    await runMigrations();
    logger.info('Database migrations completed');

    // Start data ingestion scheduler
    if (process.env.NODE_ENV !== 'test') {
      startScheduler();
    }

    // Start server
    app.listen(PORT, () => {
      logger.info(`Monument Markets API listening on port ${PORT}`, {
        port: PORT,
        env: process.env.NODE_ENV || 'development',
        frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
      });
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  const { pool } = require('./config/database');
  pool.end(() => {
    logger.info('Database connections closed');
    process.exit(0);
  });
});

init();

module.exports = app;
