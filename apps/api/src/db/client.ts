/**
 * RankForge — Database Client
 * Real PostgreSQL connection with pooling, no memoryDB in production
 */

import { Pool, PoolClient } from 'pg';
import { config } from '../config/index.js';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;

  const dbUrl = config.database.url;
  if (!dbUrl) {
    if (config.isProduction) {
      throw new Error('DATABASE_URL is required in production — FAIL FAST');
    }
    // In development, allow missing DB but log warning
    // We will throw if trying to query without DB
    console.warn('DATABASE_URL not set — database operations will fail. Set DATABASE_URL for real persistence.');
    throw new Error('DATABASE_URL not configured');
  }

  pool = new Pool({
    connectionString: dbUrl,
    ssl: config.isProduction ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    console.error('[DB] Pool error:', err);
  });

  pool.on('connect', () => {
    console.log('[DB] New client connected');
  });

  return pool;
}

export async function query(text: string, params?: any[]): Promise<any> {
  const p = getPool();
  const start = Date.now();
  try {
    const result = await p.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`[DB] Slow query ${duration}ms: ${text.substring(0, 100)}`);
    }
    return result;
  } catch (error) {
    console.error('[DB] Query error:', error, 'Query:', text.substring(0, 200));
    throw error;
  }
}

export async function getClient(): Promise<PoolClient> {
  const p = getPool();
  return p.connect();
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[DB] Pool closed');
  }
}

export function isDatabaseConfigured(): boolean {
  return !!config.database.url;
}

// Health check
export async function checkDatabaseHealth(): Promise<{ healthy: boolean; latencyMs?: number; error?: string }> {
  try {
    if (!isDatabaseConfigured()) {
      return { healthy: false, error: 'DATABASE_URL not configured' };
    }
    const start = Date.now();
    await query('SELECT 1');
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (error) {
    return { healthy: false, error: error instanceof Error ? error.message : String(error) };
  }
}
