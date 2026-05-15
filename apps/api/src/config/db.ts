/**
 * services/config/db.ts
 * Genesis Reserve — PostgreSQL Connection Pool
 *
 * Singleton pool used by all services. Handles:
 *   - Connection validation on startup
 *   - Graceful shutdown on SIGTERM / SIGINT
 *   - Query instrumentation (slow query logging > 500ms)
 *   - Transaction helper with automatic rollback on error
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { logger } from './logger';

// ── Pool configuration ────────────────────────────────────────────────────────

export const pool = new Pool({
  host:        process.env.DB_HOST     || 'localhost',
  port:        parseInt(process.env.DB_PORT || '5432'),
  database:    process.env.DB_NAME     || 'genesis_ledger',
  user:        process.env.DB_USER     || 'genesis',
  password:    process.env.DB_PASSWORD || 'genesis_dev_password',
  max:         parseInt(process.env.DB_POOL_MAX || '20'),
  idleTimeoutMillis:    30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: true }
    : false,
});

// Log pool errors so they don't silently crash the process
pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected PostgreSQL pool error');
});

// ── Query helper with slow query logging ──────────────────────────────────────

const SLOW_QUERY_MS = 500;

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(sql, params);
    const duration = Date.now() - start;
    if (duration > SLOW_QUERY_MS) {
      logger.warn({ sql: sql.slice(0, 100), duration, rows: result.rowCount }, 'Slow query');
    }
    return result;
  } catch (err) {
    logger.error({ err, sql: sql.slice(0, 100) }, 'Database query error');
    throw err;
  }
}

// ── Transaction helper ────────────────────────────────────────────────────────

/**
 * Execute a function inside a PostgreSQL transaction.
 * Automatically rolls back on error, commits on success.
 *
 * @example
 *   await withTransaction(async (client) => {
 *     await client.query('INSERT INTO ...', [...]);
 *     await client.query('UPDATE ...', [...]);
 *   });
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch((rollbackErr) => {
      logger.error({ rollbackErr }, 'Rollback failed');
    });
    throw err;
  } finally {
    client.release();
  }
}

// ── Health check ──────────────────────────────────────────────────────────────

export async function checkDbHealth(): Promise<boolean> {
  try {
    const result = await pool.query<{ now: Date }>('SELECT NOW() as now');
    return !!result.rows[0]?.now;
  } catch {
    return false;
  }
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown() {
  logger.info('Closing database pool...');
  await pool.end();
  logger.info('Database pool closed');
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
