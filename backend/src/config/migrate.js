require('dotenv').config();
const { pool } = require('./database');
const logger = require('../utils/logger');

const migrations = [
  {
    name: '001_create_users',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `,
  },
  {
    name: '002_create_signals',
    sql: `
      CREATE TABLE IF NOT EXISTS signals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(500) NOT NULL,
        description TEXT NOT NULL,
        affected_companies JSONB NOT NULL DEFAULT '[]',
        sector VARCHAR(50) NOT NULL CHECK (sector IN ('defense', 'healthcare', 'energy')),
        confidence INTEGER NOT NULL CHECK (confidence BETWEEN 1 AND 10),
        materiality INTEGER NOT NULL CHECK (materiality BETWEEN 1 AND 10),
        urgency INTEGER NOT NULL CHECK (urgency BETWEEN 1 AND 10),
        source VARCHAR(100) NOT NULL,
        source_url TEXT,
        raw_data_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_signals_sector ON signals(sector);
      CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_signals_affected_companies ON signals USING gin(affected_companies);
    `,
  },
  {
    name: '003_create_email_alerts',
    sql: `
      CREATE TABLE IF NOT EXISTS email_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sectors JSONB NOT NULL DEFAULT '[]',
        companies JSONB NOT NULL DEFAULT '[]',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_email_alerts_user_id ON email_alerts(user_id);
      CREATE INDEX IF NOT EXISTS idx_email_alerts_active ON email_alerts(is_active);
    `,
  },
  {
    name: '004_create_raw_policy_data',
    sql: `
      CREATE TABLE IF NOT EXISTS raw_policy_data (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source VARCHAR(50) NOT NULL CHECK (source IN ('congress', 'sec', 'news')),
        data JSONB NOT NULL,
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_raw_policy_data_source ON raw_policy_data(source);
      CREATE INDEX IF NOT EXISTS idx_raw_policy_data_fetched_at ON raw_policy_data(fetched_at DESC);
    `,
  },
  {
    name: '005_create_ingestion_logs',
    sql: `
      CREATE TABLE IF NOT EXISTS ingestion_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'error', 'partial')),
        records_fetched INTEGER DEFAULT 0,
        signals_created INTEGER DEFAULT 0,
        error_message TEXT,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_ingestion_logs_source ON ingestion_logs(source);
      CREATE INDEX IF NOT EXISTS idx_ingestion_logs_started_at ON ingestion_logs(started_at DESC);
    `,
  },
  {
    name: '006_create_migrations_table',
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  },
];

async function runMigrations() {
  const client = await pool.connect();
  try {
    // Create migrations tracking table first
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    for (const migration of migrations) {
      const { rows } = await client.query(
        'SELECT name FROM schema_migrations WHERE name = $1',
        [migration.name]
      );

      if (rows.length === 0) {
        logger.info(`Running migration: ${migration.name}`);
        await client.query('BEGIN');
        try {
          await client.query(migration.sql);
          await client.query(
            'INSERT INTO schema_migrations (name) VALUES ($1)',
            [migration.name]
          );
          await client.query('COMMIT');
          logger.info(`Migration completed: ${migration.name}`);
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        }
      } else {
        logger.debug(`Migration already applied: ${migration.name}`);
      }
    }

    logger.info('All migrations completed successfully');
  } catch (err) {
    logger.error('Migration failed', { error: err.message, stack: err.stack });
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };

// Allow running directly: node src/config/migrate.js
if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info('Migrations finished');
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Migration error', { error: err.message });
      process.exit(1);
    });
}
