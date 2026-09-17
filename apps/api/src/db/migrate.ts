/**
 * RankForge — PostgreSQL migration runner — STRICT, no swallowing
 * Fails hard on any error, including in test mode, per production reality requirements
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool, query, closePool } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const requiredTables = [
  'users', 'organizations', 'organization_members', 'projects', 'crawls', 'crawl_runs',
  'crawl_pages', 'crawl_issues', 'audit_findings', 'keywords', 'keyword_snapshots', 'keyword_rankings',
  'competitors', 'backlinks', 'jobs', 'job_attempts', 'integrations', 'gsc_metrics', 'ga4_metrics',
  'pagespeed_results', 'geo_runs', 'content_briefs', 'ai_usage', 'reports', 'alerts',
  'credit_wallets', 'credit_transactions', 'usage_records', 'invoices', 'api_keys', 'webhooks',
  'webhook_deliveries', 'audit_logs', 'feature_flags', '_migrations',
];

const rlsTables = [
  'organizations', 'organization_members', 'projects', 'crawls', 'crawl_runs', 'crawl_pages',
  'crawl_issues', 'audit_findings', 'keywords', 'keyword_snapshots', 'keyword_rankings',
  'competitors', 'backlinks', 'jobs', 'job_attempts', 'alerts', 'reports', 'integrations',
  'credit_wallets', 'credit_transactions', 'usage_records', 'invoices', 'api_keys',
  'audit_logs', 'gsc_metrics', 'ga4_metrics', 'pagespeed_results', 'geo_runs', 'content_briefs',
  'ai_usage', 'feature_flags',
];

async function verifyDatabase() {
  const tables = await query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const existing = new Set(tables.rows.map((row: any) => row.table_name));
  const missing = requiredTables.filter((table) => !existing.has(table));
  if (missing.length) {
    console.error(`❌ Missing required tables: ${missing.join(', ')}`);
    throw new Error(`Required tables missing: ${missing.join(', ')}`);
  }

  const rls = await query(`
    SELECT c.relname, c.relrowsecurity,
           COUNT(p.polname)::int AS policy_count
    FROM pg_class c
    LEFT JOIN pg_policy p ON p.polrelid = c.oid
    WHERE c.relname = ANY($1::text[])
    GROUP BY c.relname, c.relrowsecurity
    ORDER BY c.relname
  `, [rlsTables]);

  const rlsMap = new Map<string, any>(rls.rows.map((r: any) => [r.relname, r]));
  const invalid = rlsTables.filter(t => {
    const r: any = rlsMap.get(t);
    if (!r) return true;
    return !r.relrowsecurity || r.policy_count < 1;
  });

  if (invalid.length) {
    console.error(`❌ RLS verification failed for: ${invalid.join(', ')}`);
    const details = rls.rows.filter((r: any) => invalid.includes(r.relname)).map((r: any) => `${r.relname}(enabled=${r.relrowsecurity}, policies=${r.policy_count})`).join(', ');
    console.error(`❌ Details: ${details}`);
    throw new Error(`RLS verification failed: ${invalid.join(', ')} — ${details}`);
  }

  console.log(`✅ Verified ${existing.size} public tables and RLS on ${rls.rows.length} tenant tables`);
  console.log(`📊 Required tables all present: ${requiredTables.length}`);
}

async function executeSchema(schemaSql: string) {
  console.log(`📏 Schema size: ${schemaSql.length} chars`);
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(schemaSql);
      await client.query(`
        INSERT INTO _migrations (name) VALUES ('baseline_schema.sql')
        ON CONFLICT (name) DO NOTHING
      `);
      await client.query('COMMIT');
      console.log('✅ Baseline schema executed in single transaction');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error(`❌ Schema execution failed: ${error.message}`);
    console.error(error.stack);
    throw new Error(`Schema execution failed: ${error.message}`, { cause: error });
  }
}

export async function runMigrations() {
  console.log('🔧 Starting RankForge PostgreSQL migrations — STRICT MODE');
  console.log(`🔧 NODE_ENV=${process.env.NODE_ENV}, DATABASE_URL=${process.env.DATABASE_URL ? 'set' : 'NOT SET'}`);
  
  try {
    console.log('🔧 Testing DB connection...');
    const pool = getPool();
    await pool.query('SELECT 1');
    console.log('✅ DB connection OK');

    console.log('🔧 Creating _migrations table...');
    await query(`CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    console.log('✅ _migrations table ready');

    const schemaPath = path.join(__dirname, '../../db/schema.sql');
    console.log(`🔧 Schema path: ${schemaPath}, exists: ${fs.existsSync(schemaPath)}`);
    
    let schemaSql: string | null = null;
    let foundPath: string | null = null;
    
    if (fs.existsSync(schemaPath)) {
      foundPath = schemaPath;
    } else {
      const altPaths = [
        path.join(process.cwd(), 'db/schema.sql'),
        path.join(process.cwd(), 'apps/api/db/schema.sql'),
        path.join(__dirname, '../db/schema.sql'),
        path.join(__dirname, '../../../apps/api/db/schema.sql'),
      ];
      console.log(`🔧 Trying alt paths: ${altPaths.join(', ')}`);
      for (const p of altPaths) {
        if (fs.existsSync(p)) {
          foundPath = p;
          console.log(`🔧 Found schema at alt path: ${p}`);
          break;
        }
      }
    }
    
    if (!foundPath) {
      throw new Error(`Schema file not found: ${schemaPath}, tried alts`);
    }
    
    schemaSql = fs.readFileSync(foundPath, 'utf8');
    console.log(`🔧 Schema size: ${schemaSql.length} chars`);
    
    const baseline = await query('SELECT id FROM _migrations WHERE name = $1', ['baseline_schema.sql']);
    console.log(`🔧 Baseline exists: ${baseline.rows.length > 0}`);
    
    if (!baseline.rows.length) {
      console.log('🔧 Executing baseline schema...');
      await executeSchema(schemaSql);
    } else {
      console.log('⏭️  Baseline already executed, checking for pending columns...');
      const doBlocks = schemaSql.match(/DO \$\$[\s\S]*?END \$\$;/g) || [];
      console.log(`🔧 Found ${doBlocks.length} DO blocks for column additions`);
      for (const block of doBlocks) {
        try {
          await query(block);
        } catch (e: any) {
          console.warn(`⚠️  DO block failed (may already applied): ${e.message.substring(0, 200)}`);
          if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
            throw e;
          }
        }
      }
    }

    // drizzle/ is at the repository root; migrate.ts lives in apps/api/src/db.
    // The previous ../../../drizzle resolved to apps/drizzle, so tenant RLS
    // migrations were silently skipped. Keep this path strict and explicit.
    const drizzleFolder = path.join(__dirname, '../../../../drizzle');
    console.log(`🔧 Drizzle folder: ${drizzleFolder}, exists: ${fs.existsSync(drizzleFolder)}`);
    if (fs.existsSync(drizzleFolder)) {
      for (const file of fs.readdirSync(drizzleFolder).filter((f) => f.endsWith('.sql')).sort()) {
        const exists = await query('SELECT id FROM _migrations WHERE name = $1', [file]);
        if (exists.rows.length) continue;
        console.log(`🔧 Executing drizzle migration: ${file}`);
        const sql = fs.readFileSync(path.join(drizzleFolder, file), 'utf8');
        await query(sql);
        await query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      }
    } else {
      throw new Error(`Drizzle migrations folder not found: ${drizzleFolder}`);
    }

    console.log('🔧 Verifying database — strict...');
    await verifyDatabase();
    console.log('✅ Database migrations completed successfully — STRICT PASS');
  } catch (error: any) {
    console.error('❌ Migration failed — STRICT FAILURE:');
    console.error('❌ Error message:', error?.message);
    console.error('❌ Error stack:', error?.stack);
    throw new Error(`Migration failed: ${error?.message || String(error)}`, { cause: error });
  } finally {
    try {
      await closePool();
      console.log('🔧 Pool closed');
    } catch (e) {
      console.warn('⚠️  Error closing pool:', e);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('migrate.ts')) {
  console.log('🔧 Running migrations directly — strict mode...');
  runMigrations().then(() => {
    console.log('✅ Migrations finished, exiting 0');
    process.exit(0);
  }).catch((error) => {
    console.error('❌ Migration error — exiting 1:', error);
    console.error('Stack:', error?.stack);
    process.exit(1);
  });
}
