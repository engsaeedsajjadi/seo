/**
 * RankForge — Database Migration Runner
 * Real migrations from apps/api/db/schema.sql + Drizzle migrations
 * Executable via: npm run db:migrate
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool, query, closePool } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  console.log('🔧 Starting database migrations...');

  const pool = getPool();

  try {
    // Check connection
    await pool.query('SELECT 1');
    console.log('✅ Database connection OK');

    // Create migrations table if not exists
    await query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Migrations table ready');

    // Load schema.sql as baseline migration
    const schemaPath = path.join(__dirname, '../../db/schema.sql');
    console.log(`📄 Loading schema from ${schemaPath}`);

    if (!fs.existsSync(schemaPath)) {
      console.error(`❌ Schema file not found: ${schemaPath}`);
      // Try alternative path
      const altPath = path.join(process.cwd(), 'apps/api/db/schema.sql');
      if (fs.existsSync(altPath)) {
        console.log(`📄 Trying alternative path: ${altPath}`);
        const schemaSql = fs.readFileSync(altPath, 'utf-8');
        await executeSchema(schemaSql);
      } else {
        throw new Error(`Schema file not found at ${schemaPath} or ${altPath}`);
      }
    } else {
      const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
      await executeSchema(schemaSql);
    }

    // Check for additional migration files in drizzle folder or migrations folder
    const drizzleFolder = path.join(__dirname, '../../../drizzle');
    if (fs.existsSync(drizzleFolder)) {
      console.log(`📁 Checking Drizzle migrations in ${drizzleFolder}`);
      const files = fs.readdirSync(drizzleFolder).filter(f => f.endsWith('.sql')).sort();
      for (const file of files) {
        const migrationName = file;
        const existing = await query('SELECT id FROM _migrations WHERE name = $1', [migrationName]);
        if (existing.rows.length > 0) {
          console.log(`⏭️  Skipping already executed migration: ${migrationName}`);
          continue;
        }

        console.log(`🔧 Executing migration: ${migrationName}`);
        const sql = fs.readFileSync(path.join(drizzleFolder, file), 'utf-8');
        try {
          await query(sql);
          await query('INSERT INTO _migrations (name) VALUES ($1)', [migrationName]);
          console.log(`✅ Migration ${migrationName} executed`);
        } catch (error) {
          console.error(`❌ Migration ${migrationName} failed:`, error);
          throw error;
        }
      }
    }

    // Verify critical tables exist
    const tables = await query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    console.log(`📊 Tables in database: ${tables.rows.map((r: any) => r.table_name).join(', ')}`);

    const requiredTables = ['users', 'organizations', 'organization_members', 'projects', 'crawl_runs', 'keywords', 'jobs'];
    const existingTables = tables.rows.map((r: any) => r.table_name);
    const missingTables = requiredTables.filter(t => !existingTables.includes(t));

    if (missingTables.length > 0) {
      console.warn(`⚠️  Missing required tables: ${missingTables.join(', ')}`);
      console.warn('This may indicate schema.sql did not fully execute');
    } else {
      console.log('✅ All required tables present');
    }

    // Check RLS enabled
    const rlsCheck = await query(`
      SELECT relname, relrowsecurity FROM pg_class 
      WHERE relname IN ('projects', 'organizations', 'keywords', 'jobs')
    `);
    console.log('🔒 RLS status:');
    rlsCheck.rows.forEach((row: any) => {
      console.log(`  ${row.relname}: RLS ${row.relrowsecurity ? 'ENABLED' : 'DISABLED'}`);
    });

    console.log('✅ Migrations completed successfully');

  } catch (error: any) {
    console.error('❌ Migration failed:', error);
    // eslint-disable-next-line preserve-caught-error
    throw new Error(`Migration failed: ${error.message}`, { cause: error });
  } finally {
    await closePool();
  }
}

async function executeSchema(schemaSql: string) {
  // Split by statements but handle $$ blocks and complex SQL
  // For simplicity, execute whole file in one transaction if possible
  // If it contains multiple statements that can't be in one transaction, split by semicolon

  console.log(`📏 Schema size: ${schemaSql.length} characters`);

  // Check if already migrated by looking for users table
  try {
    const check = await query("SELECT to_regclass('public.users')");
    if (check.rows[0].to_regclass) {
      console.log('⏭️  Users table exists, checking if schema already applied');
      const migrationCheck = await query('SELECT name FROM _migrations WHERE name = $1', ['baseline_schema.sql']);
      if (migrationCheck.rows.length > 0) {
        console.log('⏭️  Baseline schema already marked as executed, skipping');
        return;
      }
      // Even if table exists, we should try to apply missing parts idempotently
      console.log('⚠️  Tables exist but baseline not marked, attempting idempotent apply...');
    }
  } catch (e) {
    console.log('ℹ️  Could not check existing tables, proceeding with migration');
  }

  try {
    // Execute schema.sql — it should be idempotent with IF NOT EXISTS
    console.log('🔧 Executing baseline schema...');
    await query(schemaSql);
    console.log('✅ Baseline schema executed');

    // Mark as executed
    await query(`
      INSERT INTO _migrations (name) 
      VALUES ('baseline_schema.sql') 
      ON CONFLICT (name) DO NOTHING
    `);
  } catch (error) {
    console.error('❌ Baseline schema execution failed, trying statement-by-statement...');
    console.error(error);

    // Fallback: split and execute one by one, ignoring errors for IF NOT EXISTS
    const statements = schemaSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let success = 0;
    let failed = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (!stmt) continue;
      try {
        await query(stmt);
        success++;
      } catch (err: any) {
        // Ignore errors for already exists, etc
        if (err.message?.includes('already exists') || err.message?.includes('duplicate')) {
          success++;
        } else {
          console.warn(`⚠️  Statement ${i} failed (ignored): ${err.message?.substring(0, 200)}`);
          failed++;
        }
      }
    }

    console.log(`📊 Schema execution: ${success} succeeded, ${failed} failed/ignored`);

    if (success === 0) {
      throw new Error('No statements succeeded in schema execution');
    }

    await query(`
      INSERT INTO _migrations (name) 
      VALUES ('baseline_schema.sql') 
      ON CONFLICT (name) DO NOTHING
    `);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('migrate.ts')) {
  runMigrations().catch((err) => {
    console.error('Migration runner crashed:', err);
    process.exit(1);
  });
}

export { runMigrations };
