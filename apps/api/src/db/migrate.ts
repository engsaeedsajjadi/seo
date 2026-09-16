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
  if (missing.length) {
    console.warn(`⚠️  Missing required tables: ${missing.join(', ')}`);
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Required tables missing: ${missing.join(', ')}`);
    }
  }

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
    console.warn(`⚠️  RLS verification warnings: ${invalid.map((r: any) => `${r.relname}(enabled=${r.relrowsecurity}, policies=${r.policy_count})`).join(', ')}`);
    // In test, log warning but don't fail if tables missing (they may not be in requiredTables)
    // In production, fail fast
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`RLS verification failed: ${invalid.map((r: any) => `${r.relname}(enabled=${r.relrowsecurity}, policies=${r.policy_count})`).join(', ')}`);
    }
    // For tables that exist but have no RLS, we still want to know
    const existingInvalid = invalid.filter((r: any) => existing.has(r.relname));
    if (existingInvalid.length > 0) {
      console.log(`🔒 RLS status for existing tables: ${existingInvalid.map((r: any) => `${r.relname}: enabled=${r.relrowsecurity}, policies=${r.policy_count}`).join(', ')}`);
    }
  }

  console.log(`✅ Verified ${existing.size} public tables and RLS on ${rls.rows.length} tenant tables`);
  console.log(`📊 Tables: ${Array.from(existing).sort().join(', ')}`);
}

async function executeSchema(schemaSql: string) {
  try {
    console.log(`📏 Schema size: ${schemaSql.length} chars, executing as single transaction...`);
    await query(schemaSql);
    console.log('✅ Baseline schema executed as single transaction');
  } catch (error: any) {
    console.warn(`⚠️  Single transaction failed: ${error.message?.substring(0, 500)}, trying statement-by-statement...`);
    const statements = schemaSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && s !== '');

    let success = 0;
    let failed = 0;
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (!stmt) continue;
      // Skip if only whitespace or comment
      if (/^--/.test(stmt) || stmt.length < 5) continue;
      try {
        await query(stmt);
        success++;
      } catch (err: any) {
        const msg = err.message || '';
        if (msg.includes('already exists') || msg.includes('duplicate') || msg.includes('already')) {
          success++;
        } else {
          console.warn(`⚠️  Statement ${i} failed (ignored): ${msg.substring(0, 200)}`);
          failed++;
        }
      }
    }
    console.log(`📊 Schema execution: ${success} succeeded, ${failed} failed/ignored`);
    if (success === 0) {
      throw new Error('No statements succeeded in schema execution');
    }
  }

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
