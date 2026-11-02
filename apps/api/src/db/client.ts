/**
 * RankForge — Database Client
 * Real PostgreSQL connection with tenant context for RLS enforcement.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, PoolClient } from 'pg';
import { config } from '../config/index.js';

let pool: Pool | null = null;
let appPool: Pool | null = null;

type DbContext = { userId: string; organizationId: string };
const transactionContext = new AsyncLocalStorage<PoolClient>();
const dbContext = new AsyncLocalStorage<DbContext>();

export function runWithDbContext<T>(context: DbContext, callback: () => T): T {
  return dbContext.run(context, callback);
}

export function getDbContext(): DbContext | undefined {
  return dbContext.getStore();
}

function createPool(connectionString: string): Pool {
  const created = new Pool({
    connectionString,
    // SSL is opt-in via DATABASE_SSL=true: stock PostgreSQL (incl. the
    // postgres:16-alpine compose service) does not serve SSL, so forcing
    // SSL in production made the shipped stack unable to reach its own
    // database. Managed DBs that require SSL set DATABASE_SSL=true.
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  created.on('error', (err) => console.error('[DB] Pool error:', err.message));
  return created;
}

/** Connection for flows with no tenant yet: login, signup, refresh, signed webhooks. */
export function getPool(): Pool {
  if (pool) return pool;
  const dbUrl = config.database.url;
  if (!dbUrl) throw new Error('DATABASE_URL is required for PostgreSQL persistence');
  pool = createPool(dbUrl);
  return pool;
}

/**
 * Authenticated requests use APP_DATABASE_URL, a role subject to RLS, so a query missing its
 * organization filter still cannot leave the caller's tenant. Without it (local development and
 * embedded tests) they share the main pool.
 */
function poolForCurrentContext(): Pool {
  const appUrl = process.env.APP_DATABASE_URL;
  if (!appUrl || !getDbContext()) return getPool();
  if (!appPool) appPool = createPool(appUrl);
  return appPool;
}

/** Leaves the tenant context for one deliberate cross-tenant step, such as listing a user's organizations. */
export function runAsSystem<T>(callback: () => T): T {
  // With no tenant context we are already on the system connection, possibly mid-transaction.
  if (!getDbContext()) return callback();
  return dbContext.exit(() => transactionContext.exit(callback));
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
  const active = transactionContext.getStore();
  if (active) return active.query(text, params);
  const client = await poolForCurrentContext().connect();
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
  const client = await poolForCurrentContext().connect();
  try { await applyTenantContext(client); return client; }
  catch (error) { client.release(); throw error; }
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const active = transactionContext.getStore();
  if (active) return fn(active);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await transactionContext.run(client, () => fn(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    try { await clearTenantContext(client); } finally { client.release(); }
  }
}

export async function closePool(): Promise<void> {
  if (appPool) {
    await appPool.end();
    appPool = null;
  }
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
