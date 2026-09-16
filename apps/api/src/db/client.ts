/**
 * RankForge — Database Client
 * Real PostgreSQL connection with tenant context for RLS enforcement.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, PoolClient } from 'pg';
import { config } from '../config/index.js';

let pool: Pool | null = null;

type DbContext = { userId: string; organizationId: string };
const dbContext = new AsyncLocalStorage<DbContext>();

export function runWithDbContext<T>(context: DbContext, callback: () => T): T {
  return dbContext.run(context, callback);
}

export function getDbContext(): DbContext | undefined {
  return dbContext.getStore();
}

export function getPool(): Pool {
  if (pool) return pool;
  const dbUrl = config.database.url;
  if (!dbUrl) throw new Error('DATABASE_URL is required for PostgreSQL persistence');

  pool = new Pool({
    connectionString: dbUrl,
    ssl: config.isProduction ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  pool.on('error', (err) => console.error('[DB] Pool error:', err));
  return pool;
}

async function applyTenantContext(client: PoolClient): Promise<void> {
  const context = getDbContext();
  if (!context) return;
  await client.query(
    `SELECT set_config('app.current_user_id', $1, false),
            set_config('app.current_organization_id', $2, false)`,
    [context.userId, context.organizationId],
  );
}

async function clearTenantContext(client: PoolClient): Promise<void> {
  await client.query(
    `SELECT set_config('app.current_user_id', '', false),
            set_config('app.current_organization_id', '', false)`,
  );
}

export async function query(text: string, params?: any[]): Promise<any> {
  const client = await getPool().connect();
  const start = Date.now();
  try {
    await applyTenantContext(client);
    const result = await client.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) console.warn(`[DB] Slow query ${duration}ms: ${text.substring(0, 100)}`);
    return result;
  } catch (error) {
    console.error('[DB] Query error:', error, 'Query:', text.substring(0, 200));
    throw error;
  } finally {
    try { await clearTenantContext(client); } finally { client.release(); }
  }
}

export async function getClient(): Promise<PoolClient> {
  const client = await getPool().connect();
  await applyTenantContext(client);
  return client;
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
    await clearTenantContext(client);
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export function isDatabaseConfigured(): boolean {
  return !!config.database.url;
}

export async function checkDatabaseHealth(): Promise<{ healthy: boolean; latencyMs?: number; error?: string }> {
  try {
    if (!isDatabaseConfigured()) return { healthy: false, error: 'DATABASE_URL not configured' };
    const start = Date.now();
    await query('SELECT 1');
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (error) {
    return { healthy: false, error: error instanceof Error ? error.message : String(error) };
  }
}
