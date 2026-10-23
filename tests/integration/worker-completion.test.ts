/**
 * RankForge — Worker completion (phase 3): integration test against a real database
 *
 * Exercises the exact module functions the worker calls:
 *  - scheduler runSchedulerTick: a due schedule enqueues exactly one
 *    job and advances; a NULL next_run_at schedule is armed, not fired;
 *    a second tick enqueues nothing more for the same slot
 *  - persistKeywordMetrics / persistCompetitorDiscovery land real rows
 *
 * Requires DATABASE_URL (a migrated RankForge schema). When DATABASE_URL
 * is not set, prints a skip notice and exits 0 — same offline-tolerance
 * convention as the other integration suites.
 */

import assert from 'assert';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('⏭️  DATABASE_URL not set — worker-completion integration test skipped (offline mode)');
  process.exit(0);
}

console.log('Testing worker completion against a real database...');

const { Pool } = await import('pg');
const { runSchedulerTick } = await import('../../apps/worker/src/scheduler.js');
const { persistKeywordMetrics, persistCompetitorDiscovery } = await import('../../apps/worker/src/dataforseo.js');

const pool = new Pool({ connectionString: DATABASE_URL });
const query = (text: string, params?: any[]) => pool.query(text, params);
const withTransaction = async <T,>(fn: (client: any) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

const suffix = Math.random().toString(36).slice(2, 10);
let orgId = '';

try {
  const user = await query(
    `INSERT INTO users (email, password_hash, name) VALUES ($1, 'x', 'Worker Completion Test') RETURNING id`,
    [`worker-completion-${suffix}@example.invalid`],
  );
  const org = await query(
    `INSERT INTO organizations (name, slug, owner_id) VALUES ('Worker Completion Test', $1, $2) RETURNING id`,
    [`worker-completion-${suffix}`, user.rows[0].id],
  );
  orgId = org.rows[0].id;

  const project = await query(
    `INSERT INTO projects (organization_id, name, domain, normalized_domain, country, language, device)
     VALUES ($1, 'Example', 'example.com', 'example.com', 'US', 'en', 'desktop') RETURNING id`,
    [orgId],
  );
  const projectId = project.rows[0].id;

  // ---------- Scheduler: due schedule fires once and advances ----------
  const due = await query(
    `INSERT INTO scheduled_jobs (organization_id, project_id, type, cron_expression, timezone, enabled, next_run_at)
     VALUES ($1, $2, 'RANK_CHECK', '* * * * *', 'Asia/Tehran', true, NOW() - INTERVAL '1 minute') RETURNING id`,
    [orgId, projectId],
  );
  const dueId = due.rows[0].id;

  // ---------- Scheduler: unarmed schedule is initialized, not fired ----------
  const unarmed = await query(
    `INSERT INTO scheduled_jobs (organization_id, project_id, type, cron_expression, timezone, enabled, next_run_at)
     VALUES ($1, $2, 'BACKLINK_SYNC', '0 6 * * *', 'UTC', true, NULL) RETURNING id`,
    [orgId, projectId],
  );
  const unarmedId = unarmed.rows[0].id;

  // ---------- Scheduler: disabled schedule is ignored ----------
  const disabled = await query(
    `INSERT INTO scheduled_jobs (organization_id, project_id, type, cron_expression, timezone, enabled, next_run_at)
     VALUES ($1, $2, 'RANK_CHECK', '* * * * *', 'UTC', false, NOW() - INTERVAL '1 minute') RETURNING id`,
    [orgId, projectId],
  );

  const tick1 = await runSchedulerTick(withTransaction as any);
  assert.strictEqual(tick1.fired, 1, 'exactly the due enabled schedule fires');
  assert.strictEqual(tick1.initialized, 1, 'the NULL next_run_at schedule is armed only');

  const jobs = await query(`SELECT * FROM jobs WHERE organization_id = $1 AND idempotency_key LIKE 'sched_%'`, [orgId]);
  assert.strictEqual(jobs.rows.length, 1);
  assert.strictEqual(jobs.rows[0].type, 'RANK_CHECK');
  assert.strictEqual(jobs.rows[0].status, 'pending');
  assert.strictEqual(jobs.rows[0].project_id, projectId);
  assert.ok(jobs.rows[0].idempotency_key.startsWith(`sched_${dueId}_`), 'idempotency key encodes schedule + due slot');

  const dueAfter = await query(`SELECT last_run_at, next_run_at FROM scheduled_jobs WHERE id = $1`, [dueId]);
  assert.ok(dueAfter.rows[0].last_run_at, 'last_run_at set after firing');
  assert.ok(new Date(dueAfter.rows[0].next_run_at) > new Date(), 'next_run_at advanced into the future');

  const unarmedAfter = await query(`SELECT last_run_at, next_run_at FROM scheduled_jobs WHERE id = $1`, [unarmedId]);
  assert.strictEqual(unarmedAfter.rows[0].last_run_at, null, 'armed-only schedule has no last_run_at');
  assert.ok(unarmedAfter.rows[0].next_run_at, 'armed schedule got a next_run_at');

  // Second tick immediately: nothing new fires for the same slot.
  const tick2 = await runSchedulerTick(withTransaction as any);
  assert.strictEqual(tick2.fired, 0, 'no double-enqueue on the next tick');
  const jobsAfter = await query(`SELECT COUNT(*)::int AS n FROM jobs WHERE organization_id = $1 AND idempotency_key LIKE 'sched_%'`, [orgId]);
  assert.strictEqual(jobsAfter.rows[0].n, 1);
  console.log('  ✓ scheduler tick: fire once, arm-only for NULL, no double-fire');

  // ---------- Keyword metrics persistence (real rows) ----------
  await query(
    `INSERT INTO keywords (organization_id, project_id, keyword, normalized_keyword, term, normalized_term, country, language)
     VALUES ($1, $2, 'example domain', 'example domain', 'example domain', 'example domain', 'US', 'en')`,
    [orgId, projectId],
  );
  await query(
    `INSERT INTO keywords (organization_id, project_id, keyword, normalized_keyword, term, normalized_term, country, language)
     VALUES ($1, $2, 'never returned', 'never returned', 'never returned', 'never returned', 'US', 'en')`,
    [orgId, projectId],
  );

  const kwStats = await persistKeywordMetrics(query as any, {
    organizationId: orgId,
    projectId,
    metrics: [
      { keyword: 'Example Domain', searchVolume: 990, cpc: 2.5, competition: 0.5, difficulty: 41, serpFeatures: [], raw: {} },
    ],
  });
  assert.strictEqual(kwStats.updated, 1);
  assert.strictEqual(kwStats.notReturned, 1);

  const kwRow = await query(`SELECT search_volume, volume, difficulty, provider FROM keywords WHERE project_id = $1 AND normalized_keyword = 'example domain'`, [projectId]);
  assert.strictEqual(kwRow.rows[0].search_volume, 990);
  assert.strictEqual(kwRow.rows[0].volume, 990, 'legacy volume column written too');
  assert.strictEqual(kwRow.rows[0].difficulty, 41);
  assert.strictEqual(kwRow.rows[0].provider, 'dataforseo');
  const untouched = await query(`SELECT search_volume FROM keywords WHERE project_id = $1 AND normalized_keyword = 'never returned'`, [projectId]);
  assert.strictEqual(untouched.rows[0].search_volume, null, 'keyword without provider data stays untouched');
  console.log('  ✓ keyword metrics persisted; unmatched keyword untouched');

  // ---------- Competitor persistence (real rows) ----------
  const compStats = await persistCompetitorDiscovery(query as any, {
    organizationId: orgId,
    projectId,
    ownDomain: 'example.com',
    competitors: [
      { domain: 'example.com', intersections: 100, raw: {} },
      { domain: 'rival.example', avgPosition: 9.5, intersections: 17, raw: { domain: 'rival.example' } },
    ],
  });
  assert.strictEqual(compStats.skippedSelf, 1);
  assert.strictEqual(compStats.inserted, 1);

  const compRow = await query(`SELECT domain, source, shared_keywords FROM competitors WHERE project_id = $1`, [projectId]);
  assert.strictEqual(compRow.rows.length, 1);
  assert.strictEqual(compRow.rows[0].domain, 'rival.example');
  assert.strictEqual(compRow.rows[0].source, 'provider');
  assert.strictEqual(compRow.rows[0].shared_keywords, 17);
  console.log('  ✓ competitor discovery persisted; self skipped');

  console.log('✅ worker-completion.test.ts (integration) — all assertions passed');
} finally {
  if (orgId) {
    await query(`DELETE FROM organizations WHERE id = $1`, [orgId]).catch(() => {});
  }
  await query(`DELETE FROM users WHERE email LIKE 'worker-completion-%@example.invalid'`).catch(() => {});
  await pool.end();
}
