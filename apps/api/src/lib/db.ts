/**
 * RankForge — Database Layer
 * PostgreSQL with fallback to in-memory for development without DB
 * Drizzle ORM pattern but using pg directly for simplicity in this monolith
 */

import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool | null {
  if (pool) return pool;
  
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn('DATABASE_URL not set — using in-memory storage (not for production)');
    return null;
  }

  pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
  });

  pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err);
  });

  return pool;
}

// In-memory fallback (for dev without DB)
export const memoryDB = {
  users: new Map<string, any>(),
  organizations: new Map<string, any>(),
  organizationMembers: new Map<string, any>(),
  projects: new Map<string, any>(),
  sessions: new Map<string, any>(),
  crawlRuns: new Map<string, any>(),
  crawlPages: new Map<string, any>(),
  auditFindings: new Map<string, any>(),
  keywords: new Map<string, any>(),
  rankings: new Map<string, any>(),
  competitors: new Map<string, any>(),
  backlinks: new Map<string, any>(),
  jobs: new Map<string, any>(),
  alerts: new Map<string, any>(),
  reports: new Map<string, any>(),
  apiKeys: new Map<string, any>(),
  webhooks: new Map<string, any>(),
  integrations: new Map<string, any>(),
  creditWallets: new Map<string, any>(),
  creditTransactions: new Map<string, any>(),
  usageRecords: new Map<string, any>(),
  auditLogs: new Map<string, any>(),
  clients: new Map<string, any>(),
};

export async function query(text: string, params?: any[]): Promise<any> {
  const p = getPool();
  if (!p) throw new Error('Database not configured — use memoryDB fallback');
  return p.query(text, params);
}

export function isDatabaseConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}
