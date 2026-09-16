/**
 * RankForge — PostgreSQL migration runner.
 * The schema is the source of truth; migration verification is fail-fast.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool, query, closePool } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const requiredTables = [
  'users', 'organizations', 'organization_members', 'projects', 'crawls', 'crawl_runs',
  'crawl_pages', 'crawl_issues', 'audit_findings', 'keywords', 'keyword_snapshots', 'competitors',
  'backlinks', 'jobs', 'integrations', 'gsc_metrics', 'geo_runs', 'reports',
  'credit_wallets', 'credit_transactions', 'api_keys', 'audit_logs',
];

const rlsTables = [
  'organizations', 'organization_members', 'projects', 'crawls', 'crawl_runs', 'crawl_pages',
  'crawl_issues', 'audit_findings', 'keywords', 'keyword_snapshots', 'competitors', 'backlinks',
  'jobs', 'alerts', 'reports', 'integrations', 'credit_wallets',
  'credit_transactions', 'usage_records', 'invoices', 'api_keys', 'audit_logs',
];

async function verifyDatabase() {
  const tables = await query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const existing = new Set(tables.rows.map((row: any) => row.table_name));
  const missing = requiredTables.filter((table) => !existing.has(table));
  if (missing.length) throw new Error(`Required tables missing: ${missing.join(', ')}`);

  const rls = await query(`
    SELECT c.relname, c.relrowsecurity,
           COUNT(p.policyname)::int AS policy_count
    FROM pg_class c
    LEFT JOIN pg_policy p ON p.polrelid = c.oid
    WHERE c.relname = ANY($1::text[])
    GROUP BY c.relname, c.relrowsecurity
    ORDER BY c.relname
  `, [rlsTables]);

  const invalid = rls.rows.filter((row: any) => !row.relrowsecurity || row.policy_count < 1);
  if (invalid.length) {
    throw new Error(`RLS verification failed: ${invalid.map((r: any) => `${r.relname}(enabled=${r.relrowsecurity}, policies=${r.policy_count})`).join(', ')}`);
  }

  console.log(`✅ Verified ${existing.size} public tables and RLS on ${rls.rows.length} tenant tables`);
}

async function executeSchema(schemaSql: string) {
  await query(schemaSql);
  await query(`
    INSERT INTO _migrations (name) VALUES ('baseline_schema.sql')
    ON CONFLICT (name) DO NOTHING
  `);
}

export async function runMigrations() {
  console.log('🔧 Starting RankForge PostgreSQL migrations...');
  try {
    await getPool().query('SELECT 1');
    await query(`CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    const schemaPath = path.join(__dirname, '../../db/schema.sql');
    if (!fs.existsSync(schemaPath)) throw new Error(`Schema file not found: ${schemaPath}`);
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    const baseline = await query('SELECT id FROM _migrations WHERE name = $1', ['baseline_schema.sql']);
    if (!baseline.rows.length) await executeSchema(schemaSql);

    const drizzleFolder = path.join(__dirname, '../../../drizzle');
    if (fs.existsSync(drizzleFolder)) {
      for (const file of fs.readdirSync(drizzleFolder).filter((f) => f.endsWith('.sql')).sort()) {
        const exists = await query('SELECT id FROM _migrations WHERE name = $1', [file]);
        if (exists.rows.length) continue;
        await query(fs.readFileSync(path.join(drizzleFolder, file), 'utf8'));
        await query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      }
    }

    await verifyDatabase();
    console.log('✅ Database migrations completed successfully');
  } catch (error: any) {
    console.error('❌ Migration failed:', error);
    throw new Error(`Migration failed: ${error?.message || String(error)}`, { cause: error });
  } finally {
    await closePool();
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('migrate.ts')) {
  runMigrations().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
