/**
 * Worker operational suite: a real Worker process, real PostgreSQL, restricted login.
 * External websites and providers are mocked (tests/helpers/worker-external-mock.ts),
 * so provider results here do not prove a live integration.
 *
 * Requires WORKER_TEST_DATABASE_URL: an owner connection to a migrated database whose
 * name contains "test". All data is synthetic and removed at the end.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const OWNER_URL = process.env.WORKER_TEST_DATABASE_URL;
if (!OWNER_URL) { console.log('SKIP: WORKER_TEST_DATABASE_URL not set'); process.exit(0); }
if (!new URL(OWNER_URL).pathname.includes('test')) throw new Error('Refusing to run: database name must contain "test"');

process.env.ENCRYPTION_KEY ||= randomBytes(32).toString('hex');
process.env.JWT_SECRET ||= randomBytes(32).toString('hex');
const { serializeTokens } = await import('../../apps/worker/src/google.js');
const { runSchedulerTick } = await import('../../apps/worker/src/scheduler.js');

const owner = new Pool({ connectionString: OWNER_URL, max: 4 });
const tag = randomBytes(4).toString('hex');
const loginRole = `rf_worker_test_${tag}`;
const loginPassword = randomBytes(16).toString('hex');
const workerUrlObj = new URL(OWNER_URL);
workerUrlObj.username = loginRole;
workerUrlObj.password = loginPassword;
const WORKER_URL = workerUrlObj.toString();

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`PASS ${name}`); return; }
  failures.push(name);
  console.log(`FAIL ${name}${detail === undefined ? '' : ` :: ${JSON.stringify(detail)}`}`);
}
const q = (text: string, params?: unknown[]) => owner.query(text, params as any[]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const rows = async (text: string, params?: unknown[]) => (await q(text, params)).rows;
const one = async (text: string, params?: unknown[]) => (await q(text, params)).rows[0];

async function makeOrg(label: string, domain: string, balance = 100) {
  const user = await one(`INSERT INTO users (email, password_hash, name) VALUES ($1, 'x', $2) RETURNING id`, [`${label}-${tag}@example.invalid`, label]);
  const org = await one(`INSERT INTO organizations (name, slug, owner_id) VALUES ($1, $2, $3) RETURNING id`, [label, `${label}-${tag}`.toLowerCase(), user.id]);
  await q(`INSERT INTO credit_wallets (organization_id, balance, total_granted) VALUES ($1, $2, $2)
           ON CONFLICT (organization_id) DO UPDATE SET balance = $2, total_granted = $2, total_consumed = 0`, [org.id, balance]);
  const project = await one(`INSERT INTO projects (organization_id, name, domain, normalized_domain, country, language) VALUES ($1, $2, $3, $3, 'IR', 'fa') RETURNING id`, [org.id, label, domain]);
  return { userId: user.id as string, orgId: org.id as string, projectId: project.id as string };
}
async function enqueue(org: { orgId: string; projectId: string }, type: string, payload: object = {}, maxAttempts = 3, projectId: string | null = org.projectId) {
  return (await one(`INSERT INTO jobs (organization_id, project_id, type, payload, max_attempts, idempotency_key) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [org.orgId, projectId, type, JSON.stringify(payload), maxAttempts, `test_${randomUUID()}`])).id as string;
}
async function waitJob(id: string, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const j = await one(`SELECT status, attempts, error, error_code, result FROM jobs WHERE id = $1`, [id]);
    if (['completed', 'dead_letter', 'failed', 'cancelled'].includes(j.status)) return j;
    await sleep(100);
  }
  return one(`SELECT status, attempts, error, error_code, result FROM jobs WHERE id = $1`, [id]);
}
const runJob = async (org: { orgId: string; projectId: string }, type: string, payload: object = {}, maxAttempts = 3, projectId?: string | null) => {
  const id = await enqueue(org, type, payload, maxAttempts, projectId === undefined ? org.projectId : projectId);
  return { id, job: await waitJob(id) };
};
const count = async (text: string, params?: unknown[]) => Number((await one(`SELECT count(*)::int AS n FROM ${text}`, params)).n);

await q(`CREATE ROLE ${loginRole} LOGIN PASSWORD '${loginPassword}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE IN ROLE rankforge_worker`);
const A = await makeOrg('OrgA', 'rank.rankforge.test');
const B = await makeOrg('OrgB', 'b.rankforge.test');
const poor = await makeOrg('OrgPoor', 'fixture.rankforge.test', 2);
const crawlA = await makeOrg('OrgCrawl', 'fixture.rankforge.test');
const flaky = await makeOrg('OrgFlaky', 'flaky.rankforge.test');
const down = await makeOrg('OrgDown', 'down.rankforge.test');
const bSecret = 'TENANT-B-SECRET-MARKER';
await q(`INSERT INTO integrations (organization_id, project_id, provider, status, credentials_encrypted, config) VALUES ($1, $2, 'gsc', 'connected', $3, '{"siteUrl":"sc-domain:b.rankforge.test"}')`, [B.orgId, B.projectId, Buffer.from(bSecret)]);

const restricted = new Pool({ connectionString: WORKER_URL, max: 6 });
const denied = async (sql: string, params: unknown[] = []) => {
  try { await restricted.query(sql, params as any[]); return false; }
  catch (e: any) { return e.code === '42501'; }
};
/** Runs fn in a transaction on one restricted connection, always rolling back. */
async function asWorker<T>(fn: (c: any) => Promise<T>): Promise<T> {
  const c = await restricted.connect();
  try { await c.query('BEGIN'); return await fn(c); } finally { await c.query('ROLLBACK'); c.release(); }
}

console.log('--- Suite: role, grants and tenant identity');
const role = await one(`SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = current_setting('app.x', true) OR rolname = $1`, [loginRole]);
check('login role has no elevated attributes', !role.rolsuper && !role.rolbypassrls && !role.rolcreaterole && !role.rolcreatedb, role);
check('base role cannot log in', !(await one(`SELECT rolcanlogin FROM pg_roles WHERE rolname = 'rankforge_worker'`)).rolcanlogin);
check('no table privilege is granted to PUBLIC', await count(`information_schema.role_table_grants WHERE grantee = 'PUBLIC' AND table_schema = 'public'`) === 0);
check('RLS is enabled on every organization_id table', await count(`information_schema.columns c JOIN pg_class k ON k.relname = c.table_name AND k.relnamespace = 'public'::regnamespace
  WHERE c.table_schema = 'public' AND c.column_name = 'organization_id' AND k.relkind = 'r' AND NOT k.relrowsecurity`) === 0);
for (const t of ['jobs', 'job_attempts', 'credit_wallets', 'credit_transactions', 'scheduled_jobs', 'users', 'api_keys', 'rf_worker_bindings']) {
  check(`direct SELECT on ${t} is denied`, await denied(`SELECT 1 FROM ${t} LIMIT 1`));
}
check('direct UPDATE of jobs is denied', await denied(`UPDATE jobs SET status = 'completed'`));
check('DELETE on projects is denied', await denied(`DELETE FROM projects`));
check('TRUNCATE on alerts is denied', await denied(`TRUNCATE alerts`));
check('ALTER TABLE on projects is denied', await denied(`ALTER TABLE projects DISABLE ROW LEVEL SECURITY`));
check('CREATE TABLE in public is denied', await denied(`CREATE TABLE rf_probe (id int)`));
check('old claim function from migration 005 is denied', await denied(`SELECT * FROM claim_jobs(1)`));
check('old tenant discovery function from migration 006 is denied', await denied(`SELECT * FROM discover_due_schedule_tenants(1)`));
check('internal dead-letter function is denied', await denied(`SELECT rf__dead_letter($1, 'x', 'TIMEOUT')`, [randomUUID()]));
check('privilege escalation via SET ROLE is denied', await denied(`SET ROLE postgres`));
check('ALTER ROLE to SUPERUSER is denied', await denied(`ALTER ROLE ${loginRole} SUPERUSER`));

const spoofRows = await asWorker(async (c) => {
  await c.query(`SELECT set_config('app.current_organization_id', $1, true)`, [B.orgId]);
  return (await c.query(`SELECT id FROM projects`)).rowCount;
});
check('GUC spoof without a binding sees zero rows', spoofRows === 0, spoofRows);
const spoofCredentials = await asWorker(async (c) => {
  await c.query(`SELECT set_config('app.current_organization_id', $1, true)`, [B.orgId]);
  return (await c.query(`SELECT credentials_encrypted FROM integrations`)).rowCount;
});
check('GUC spoof cannot read encrypted credentials', spoofCredentials === 0, spoofCredentials);

// A running job in org A, used for binding and fencing checks. Pause before the Worker starts.
const leaseJob = await enqueue(A, 'ALERT_EVALUATION');
const claimed = await asWorker(async (c) => (await c.query(`SELECT id, execution_id FROM rf_worker_claim_jobs(10, 60)`)).rows);
check('claim is rolled back cleanly in test transaction', claimed.some((j: any) => j.id === leaseJob), claimed.length);
const c1 = await restricted.connect();
const c2 = await restricted.connect();
await c1.query('BEGIN'); await c2.query('BEGIN');
const [g1, g2] = await Promise.all([
  c1.query(`SELECT id, execution_id, organization_id FROM rf_worker_claim_jobs(1, 60)`),
  c2.query(`SELECT id, execution_id, organization_id FROM rf_worker_claim_jobs(1, 60)`),
]);
check('two concurrent claims never return the same job', g1.rows[0]?.id !== g2.rows[0]?.id || (g1.rowCount === 0 && g2.rowCount === 0), [g1.rows[0]?.id, g2.rows[0]?.id]);
await c1.query('COMMIT'); await c2.query('ROLLBACK');
c2.release();
const lease = g1.rows[0];

await c1.query('BEGIN');
await c1.query(`SELECT rf_worker_bind_job($1, $2)`, [lease.id, lease.execution_id]);
const ownRows = (await c1.query(`SELECT id, organization_id FROM projects`)).rows;
check('bound execution sees only its own tenant', ownRows.length > 0 && ownRows.every((r: any) => r.organization_id === lease.organization_id), ownRows.length);
await c1.query(`SELECT set_config('app.current_organization_id', $1, true)`, [B.orgId]);
const crossRows = (await c1.query(`SELECT id FROM projects`)).rowCount;
check('changing the GUC after binding reaches no other tenant', crossRows === 0, crossRows);
await c1.query('ROLLBACK');
await c1.query('BEGIN');
await c1.query(`SELECT rf_worker_bind_job($1, $2)`, [lease.id, lease.execution_id]);
await c1.query('COMMIT');
const reuse = (await c1.query(`SELECT id FROM projects`)).rowCount;
check('a binding does not outlive its transaction', reuse === 0, reuse);
c1.release();

const wrongBind = await asWorker(async (c) => {
  try { await c.query(`SELECT rf_worker_bind_job($1, $2)`, [lease.id, randomUUID()]); return false; }
  catch (e: any) { return e.code === '42501'; }
}).catch(() => false);
check('binding with a wrong execution_id is rejected', wrongBind);
const staleComplete = (await restricted.query(`SELECT rf_worker_complete_job($1, $2, '{}', 1) AS ok`, [lease.id, randomUUID()])).rows[0].ok;
check('completing with a stale execution_id is rejected', staleComplete === false);
const staleFail = (await restricted.query(`SELECT rf_worker_fail_job($1, $2, 'x', 'RETRYABLE', true, 1) AS o`, [lease.id, randomUUID()])).rows[0].o;
check('failing with a stale execution_id is rejected', staleFail === 'lost');
check('job is untouched by stale calls', (await one(`SELECT status FROM jobs WHERE id = $1`, [lease.id])).status === 'running');

// Expire the lease: the real Worker must recover it, and the old execution must stop working.
await q(`UPDATE jobs SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE id = $1`, [lease.id]);

console.log('--- Starting real Worker process with the restricted login');
const logs: string[] = [];
const worker: ChildProcess = spawn(process.execPath, ['--import', 'tsx', '--import', './tests/helpers/worker-external-mock.ts', 'apps/worker/src/index.ts'], {
  env: {
    PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: WORKER_URL,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY, JWT_SECRET: process.env.JWT_SECRET,
    WORKER_POLL_INTERVAL: '100', WORKER_CONCURRENCY: '4', WORKER_TIMEOUT: '20000', CRAWLER_DELAY: '0', SCHEDULER_TICK_MS: '300',
    DATAFORSEO_LOGIN: 'mock', DATAFORSEO_PASSWORD: 'DFS-PASSWORD-SECRET-MARKER', OPENAI_API_KEY: 'OPENAI-KEY-SECRET-MARKER',
    PAGESPEED_API_KEY: 'PAGESPEED-KEY-SECRET-MARKER', GOOGLE_CLIENT_ID: 'mock', GOOGLE_CLIENT_SECRET: 'GOOGLE-CLIENT-SECRET-MARKER',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
worker.stdout!.on('data', (d) => logs.push(String(d)));
worker.stderr!.on('data', (d) => logs.push(String(d)));

try {
  const recovered = await waitJob(lease.id);
  check('Retry: expired lease is recovered and finishes', recovered.status === 'completed', recovered);
  check('Retry: recovery counts as a new attempt', recovered.attempts === 2, recovered.attempts);
  const leaseAttempts = await rows(`SELECT attempt_number, status, error_code FROM job_attempts WHERE job_id = $1 ORDER BY 1`, [lease.id]);
  check('Retry: attempt history records the lost attempt', leaseAttempts[0]?.status === 'failed' && leaseAttempts[0]?.error_code === 'TIMEOUT' && leaseAttempts[1]?.status === 'completed', leaseAttempts);
  const oldExec = (await restricted.query(`SELECT rf_worker_complete_job($1, $2, '{}', 1) AS ok`, [lease.id, lease.execution_id])).rows[0].ok;
  check('Retry: the old execution cannot complete the recovered job', oldExec === false);

  console.log('--- Test 1: real alert');
  const finding = await one(`INSERT INTO crawl_runs (organization_id, project_id, status) VALUES ($1, $2, 'completed') RETURNING id`, [A.orgId, A.projectId]);
  await q(`INSERT INTO audit_findings (organization_id, project_id, crawl_run_id, rule_id, severity, category, title, description, recommendation, status)
           VALUES ($1, $2, $3, 'missing_title', 'critical', 'metadata', 'T', 'D', 'R', 'open')`, [A.orgId, A.projectId, finding.id]);
  await q(`UPDATE alerts SET read = true WHERE organization_id = $1`, [A.orgId]);
  const a1 = await runJob(A, 'ALERT_EVALUATION', {}, 3, null);
  check('T1 job completes', a1.job.status === 'completed', a1.job);
  check('T1 alertsCreated counts the insert', a1.job.result?.alertsCreated === 1, a1.job.result);
  const alertRow = await one(`SELECT project_id FROM alerts WHERE organization_id = $1 AND rule = 'critical_issues' AND read = false`, [A.orgId]);
  check('T1 alert row exists for the right project', alertRow?.project_id === A.projectId, alertRow);
  const a2 = await runJob(A, 'ALERT_EVALUATION', {}, 3, null);
  check('T1 rerun does not count a duplicate', a2.job.result?.alertsCreated === 0, a2.job.result);
  check('T1 rerun leaves exactly one unread alert', await count(`alerts WHERE organization_id = $1 AND rule = 'critical_issues' AND read = false`, [A.orgId]) === 1);
  await q(`UPDATE alerts SET read = true WHERE organization_id = $1`, [A.orgId]);
  const a3 = await runJob(A, 'ALERT_EVALUATION', {}, 3, null);
  check('T1 a new alert is raised after the old one is read', a3.job.result?.alertsCreated === 1, a3.job.result);
  check('T1 no alert leaked to another tenant', await count(`alerts WHERE organization_id = $1 AND rule = 'critical_issues'`, [B.orgId]) === 0);

  console.log('--- Test 2: crawl and site audit (fixture site)');
  const before = await one(`SELECT balance FROM credit_wallets WHERE organization_id = $1`, [crawlA.orgId]);
  const c = await runJob(crawlA, 'SITE_CRAWL', { domain: 'fixture.rankforge.test', maxPages: 10 });
  check('T2 crawl job completes', c.job.status === 'completed', c.job);
  const runId = c.job.result?.crawlRunId;
  check('T2 crawl_runs row is created without a payload crawlRunId', !!runId, c.job.result);
  const run = await one(`SELECT status, crawled_pages FROM crawl_runs WHERE id = $1`, [runId]);
  check('T2 crawl_runs is completed', run?.status === 'completed', run);
  check('T2 crawl_pages stored', await count(`crawl_pages WHERE crawl_run_id = $1 AND organization_id = $2`, [runId, crawlA.orgId]) >= 4);
  const findings = await count(`audit_findings WHERE crawl_run_id = $1`, [runId]);
  check('T2 audit_findings created', findings > 0, findings);
  check('T2 crawl_issues created', await count(`crawl_issues WHERE crawl_run_id = $1`, [runId]) === findings);
  check('T2 SEO score stored on project', (await one(`SELECT seo_score FROM projects WHERE id = $1`, [crawlA.projectId])).seo_score !== null);
  check('T2 charged exactly 5 credits', (await one(`SELECT balance FROM credit_wallets WHERE organization_id = $1`, [crawlA.orgId])).balance === before.balance - 5);
  const c2Attempts = await rows(`SELECT status FROM job_attempts WHERE job_id = $1`, [c.id]);
  check('T2 job_attempts is correct', c2Attempts.length === 1 && c2Attempts[0].status === 'completed', c2Attempts);
  // Rebuild on rerun of the same run: findings must be replaced, not duplicated.
  const pagesFirst = await count(`crawl_pages WHERE crawl_run_id = $1`, [runId]);
  const rerun = await runJob(crawlA, 'SITE_CRAWL', { domain: 'fixture.rankforge.test', maxPages: 10, crawlRunId: runId });
  check('T2 rerun on the same run succeeds', rerun.job.status === 'completed', rerun.job);
  check('T2 rerun does not duplicate findings', await count(`audit_findings WHERE crawl_run_id = $1`, [runId]) === findings);
  check('T2 rerun does not duplicate pages', await count(`crawl_pages WHERE crawl_run_id = $1`, [runId]) === pagesFirst);
  const bBefore = await count(`audit_findings WHERE organization_id = $1`, [B.orgId]);
  const foreignRun = await one(`INSERT INTO crawl_runs (organization_id, project_id, status) VALUES ($1, $2, 'completed') RETURNING id`, [B.orgId, B.projectId]);
  const cross = await runJob(crawlA, 'SITE_CRAWL', { domain: 'fixture.rankforge.test', crawlRunId: foreignRun.id }, 1);
  check('T2 a crawl cannot adopt another tenant\'s run', cross.job.status === 'dead_letter', cross.job);
  check('T2 other tenant\'s run is unchanged', (await one(`SELECT status FROM crawl_runs WHERE id = $1`, [foreignRun.id])).status === 'completed');
  check('T2 other tenant\'s findings are unchanged', await count(`audit_findings WHERE organization_id = $1`, [B.orgId]) === bBefore);
  const ssrf = await runJob(crawlA, 'SITE_CRAWL', { domain: 'rebind.rankforge.test' }, 3);
  check('T2 hostname resolving to a private IP is blocked without retry', ssrf.job.status === 'dead_letter' && ssrf.job.attempts === 1, ssrf.job);
  const audit = await runJob(crawlA, 'SEO_AUDIT');
  check('T2 SEO_AUDIT rebuilds findings from stored pages', audit.job.status === 'completed' && audit.job.result?.findingsCount > 0, audit.job);

  console.log('--- Test 3: rank tracking (mock provider)');
  const kw = await one(`INSERT INTO keywords (organization_id, project_id, keyword, term, normalized_keyword, normalized_term) VALUES ($1, $2, 'mock keyword', 'mock keyword', 'mock keyword', 'mock keyword') RETURNING id`, [A.orgId, A.projectId]);
  const kwB = await one(`INSERT INTO keywords (organization_id, project_id, keyword, term, normalized_keyword, normalized_term) VALUES ($1, $2, 'b keyword', 'b keyword', 'b keyword', 'b keyword') RETURNING id`, [B.orgId, B.projectId]);
  const r1 = await runJob(A, 'RANK_CHECK');
  check('T3 rank job completes', r1.job.status === 'completed' && r1.job.result?.ranked === 1, r1.job);
  check('T3 keyword position stored', (await one(`SELECT current_position FROM keywords WHERE id = $1`, [kw.id])).current_position === 7);
  await runJob(A, 'RANK_CHECK');
  check('T3 ON CONFLICT keeps one row per day', await count(`keyword_rankings WHERE keyword_id = $1`, [kw.id]) === 1);
  check('T3 other tenant keyword is untouched', (await one(`SELECT current_position FROM keywords WHERE id = $1`, [kwB.id])).current_position === null);
  check('T3 no ranking row for other tenant', await count(`keyword_rankings WHERE organization_id = $1`, [B.orgId]) === 0);
  const crossRank = await runJob(A, 'RANK_CHECK', {}, 1, B.projectId);
  check('T3 job pointing at another tenant\'s project fails', crossRank.job.status === 'dead_letter', crossRank.job);
  const kwRefresh = await runJob(A, 'KEYWORD_REFRESH');
  check('T3 KEYWORD_REFRESH stores metrics', kwRefresh.job.status === 'completed' && (await one(`SELECT search_volume FROM keywords WHERE id = $1`, [kw.id])).search_volume === 900, kwRefresh.job);

  console.log('--- Test 4: backlinks and competitors (mock provider)');
  const b1 = await runJob(A, 'BACKLINK_SYNC');
  check('T4 backlink inserted', b1.job.status === 'completed' && b1.job.result?.inserted === 1, b1.job);
  const b2 = await runJob(A, 'BACKLINK_SYNC');
  check('T4 backlink UPSERT refreshes', b2.job.result?.refreshed === 1 && await count(`backlinks WHERE project_id = $1`, [A.projectId]) === 1, b2.job);
  const comp = await runJob(A, 'COMPETITOR_CHECK');
  check('T4 competitor stored', comp.job.status === 'completed' && await count(`competitors WHERE project_id = $1`, [A.projectId]) === 1, comp.job);
  await runJob(A, 'COMPETITOR_CHECK');
  check('T4 competitor UPSERT does not duplicate', await count(`competitors WHERE project_id = $1`, [A.projectId]) === 1);
  check('T4 nothing written to other tenant', await count(`backlinks WHERE organization_id = $1`, [B.orgId]) + await count(`competitors WHERE organization_id = $1`, [B.orgId]) === 0);

  console.log('--- Test 5: GSC and GA4 (mock provider)');
  const tokens = serializeTokens({ accessToken: 'OLD-ACCESS-SECRET-MARKER', refreshToken: 'REFRESH-SECRET-MARKER', expiresAt: Date.now() - 1000 });
  await q(`INSERT INTO integrations (organization_id, project_id, provider, status, credentials_encrypted, config) VALUES ($1, $2, 'gsc', 'connected', $3, '{"siteUrl":"sc-domain:rank.rankforge.test"}'), ($1, $2, 'ga4', 'connected', $3, '{"propertyId":"properties/100"}')`, [A.orgId, A.projectId, tokens]);
  const gscKeyword = await one(`INSERT INTO keywords (organization_id, project_id, keyword, term, normalized_keyword, normalized_term) VALUES ($1, $2, 'mock query', 'mock query', 'mock query', 'mock query') RETURNING id`, [A.orgId, A.projectId]);
  const g = await runJob(A, 'GSC_SYNC');
  check('T5 GSC sync completes after token refresh', g.job.status === 'completed', g.job);
  check('T5 gsc_metrics stored', await count(`gsc_metrics WHERE project_id = $1`, [A.projectId]) === 1);
  const gscRank = await one(`SELECT position, provider FROM keyword_rankings WHERE keyword_id = $1`, [gscKeyword.id]);
  check('T5 tracked keyword gets its rank from Search Console', gscRank?.position === 3 && gscRank?.provider === 'gsc' && g.job.result?.ranksUpdated === 1, { gscRank, result: g.job.result });
  check('T5 a keyword absent from Search Console is left alone', (await one(`SELECT current_position FROM keywords WHERE id = $1`, [kw.id])).current_position === 7);
  await q(`UPDATE keyword_rankings SET provider = 'csv', position = 9 WHERE keyword_id = $1`, [gscKeyword.id]);
  await runJob(A, 'GSC_SYNC');
  check('T5 Search Console does not overwrite a rank from another source', (await one(`SELECT position FROM keyword_rankings WHERE keyword_id = $1`, [gscKeyword.id])).position === 9);
  const stored = await one(`SELECT credentials_encrypted FROM integrations WHERE organization_id = $1 AND provider = 'gsc'`, [A.orgId]);
  check('T5 refreshed token is stored encrypted', !String(stored.credentials_encrypted).includes('REFRESHED-ACCESS-SECRET-MARKER'));
  const ga = await runJob(A, 'GA4_SYNC');
  check('T5 ga4_metrics stored', ga.job.status === 'completed' && await count(`ga4_metrics WHERE project_id = $1`, [A.projectId]) === 1, ga.job);
  await q(`UPDATE integrations SET config = '{"propertyId":"properties/500"}' WHERE organization_id = $1 AND provider = 'ga4'`, [A.orgId]);
  const gaDown = await runJob(A, 'GA4_SYNC', {}, 1);
  check('T5 provider outage fails the job visibly', gaDown.job.status === 'dead_letter' && !!gaDown.job.error, gaDown.job);

  console.log('--- Test 6: content brief and AI usage (mock provider)');
  const brief = await one(`INSERT INTO content_briefs (organization_id, project_id, title, target_keyword, status) VALUES ($1, $2, 'Brief', 'kw', 'draft') RETURNING id`, [A.orgId, A.projectId]);
  const bj = await runJob(A, 'CONTENT_BRIEF', { briefId: brief.id });
  check('T6 brief generated', bj.job.status === 'completed' && (await one(`SELECT status FROM content_briefs WHERE id = $1`, [brief.id])).status === 'completed', bj.job);
  check('T6 AI usage recorded once', await count(`ai_usage WHERE organization_id = $1 AND reference_id = $2`, [A.orgId, brief.id]) === 1);
  await q(`UPDATE jobs SET status = 'pending', attempts = 0 WHERE id = $1`, [bj.id]);
  const bj2 = await waitJob(bj.id);
  await sleep(300);
  check('T6 re-executing the same job records no second usage', bj2.status === 'completed' && await count(`ai_usage WHERE organization_id = $1 AND reference_id = $2`, [A.orgId, brief.id]) === 1, bj2);
  const failBrief = await one(`INSERT INTO content_briefs (organization_id, project_id, title, target_keyword, status) VALUES ($1, $2, 'FAIL-AI', 'kw', 'draft') RETURNING id`, [A.orgId, A.projectId]);
  const fb = await runJob(A, 'CONTENT_BRIEF', { briefId: failBrief.id }, 1);
  check('T6 AI failure dead-letters and marks the brief failed', fb.job.status === 'dead_letter' && (await one(`SELECT status FROM content_briefs WHERE id = $1`, [failBrief.id])).status === 'failed', fb.job);
  check('T6 AI failure records no usage', await count(`ai_usage WHERE reference_id = $1`, [failBrief.id]) === 0);
  const geo = await runJob(A, 'AI_VISIBILITY_CHECK', { prompt: 'PRIVATE-PROMPT-MARKER' });
  check('T6 GEO run stored with usage', geo.job.status === 'completed' && await count(`geo_runs WHERE project_id = $1`, [A.projectId]) === 1, geo.job);

  console.log('--- Test 7: PageSpeed and reports');
  const ps = await runJob(A, 'PAGESPEED_CHECK', { url: 'https://rank.rankforge.test/' });
  check('T7 PageSpeed result stored', ps.job.status === 'completed' && await count(`pagespeed_results WHERE project_id = $1`, [A.projectId]) === 1, ps.job);
  const rep = await runJob(A, 'REPORT_GENERATION', { type: 'seo' });
  check('T7 report inserted', rep.job.status === 'completed' && !!rep.job.result?.reportId, rep.job);
  const pending = await one(`INSERT INTO reports (organization_id, project_id, type, title, format, status) VALUES ($1, $2, 'seo', 'R', 'json', 'pending') RETURNING id`, [A.orgId, A.projectId]);
  const rep2 = await runJob(A, 'REPORT_GENERATION', { type: 'seo', reportId: pending.id });
  check('T7 pending report completed with a snapshot', rep2.job.status === 'completed' && (await one(`SELECT status, data_snapshot IS NOT NULL AS has FROM reports WHERE id = $1`, [pending.id])).has === true, rep2.job);

  console.log('--- Test 8: retry and dead letter');
  const fl = await runJob(flaky, 'SITE_CRAWL', { domain: 'flaky.rankforge.test' });
  check('T8 temporary failure retries and succeeds', fl.job.status === 'completed' && fl.job.attempts === 2, fl.job);
  const flAttempts = await rows(`SELECT status FROM job_attempts WHERE job_id = $1 ORDER BY attempt_number`, [fl.id]);
  check('T8 attempt history is failed then completed', flAttempts.map((x) => x.status).join() === 'failed,completed', flAttempts);
  const dl = await runJob(down, 'SITE_CRAWL', { domain: 'down.rankforge.test' }, 2);
  check('T8 retries stop at max_attempts and dead-letter', dl.job.status === 'dead_letter' && dl.job.attempts === 2, dl.job);
  check('T8 every attempt is recorded', await count(`job_attempts WHERE job_id = $1 AND status = 'failed'`, [dl.id]) === 2);
  check('T8 dead letter raises an alert', await count(`alerts WHERE organization_id = $1 AND rule = 'job_dead_letter'`, [down.orgId]) === 1);
  check('T8 dead letter fails the crawl run', (await one(`SELECT status FROM crawl_runs WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1`, [down.orgId])).status === 'failed');
  const unknown = await runJob(flaky, 'AUDIT', {}, 3, null);
  check('T8 non-retryable error dead-letters on the first attempt', unknown.job.status === 'dead_letter' && unknown.job.attempts === 1, unknown.job);

  console.log('--- Test 9: credits and idempotency');
  const ledgerOk = async (orgId: string) => {
    const w = await one(`SELECT balance, total_granted FROM credit_wallets WHERE organization_id = $1`, [orgId]);
    const sum = Number((await one(`SELECT COALESCE(SUM(amount), 0)::int AS s FROM credit_transactions WHERE organization_id = $1`, [orgId])).s);
    return { ok: w.balance === w.total_granted + sum, w, sum };
  };
  check('T9 retried job is charged only once', await count(`credit_transactions WHERE reference_id = $1 AND type = 'consumption'`, [fl.id]) === 1);
  check('T9 wallet matches ledger after retry', (await ledgerOk(flaky.orgId)).ok, await ledgerOk(flaky.orgId));
  check('T9 dead-lettered job is refunded', await count(`credit_transactions WHERE reference_id = $1 AND type = 'refund'`, [dl.id]) === 1);
  check('T9 wallet is restored after refund', (await one(`SELECT balance FROM credit_wallets WHERE organization_id = $1`, [down.orgId])).balance === 100);
  check('T9 wallet matches ledger after refund', (await ledgerOk(down.orgId)).ok, await ledgerOk(down.orgId));
  const pj = await runJob(poor, 'SITE_CRAWL', { domain: 'fixture.rankforge.test' });
  check('T9 insufficient credit dead-letters without retry', pj.job.status === 'dead_letter' && pj.job.error_code === 'INSUFFICIENT_CREDITS' && pj.job.attempts === 1, pj.job);
  check('T9 insufficient credit does no billable work', await count(`crawl_pages WHERE organization_id = $1`, [poor.orgId]) === 0);
  check('T9 insufficient credit leaves the balance alone', (await one(`SELECT balance FROM credit_wallets WHERE organization_id = $1`, [poor.orgId])).balance === 2);
  check('T9 insufficient credit writes no ledger row', await count(`credit_transactions WHERE organization_id = $1`, [poor.orgId]) === 0);
  await q(`UPDATE credit_wallets SET balance = 7, total_granted = 7 WHERE organization_id = $1`, [poor.orgId]);
  const race = await Promise.all([1, 2, 3].map(() => runJob(poor, 'SITE_CRAWL', { domain: 'fixture.rankforge.test', maxPages: 1 })));
  const raced = race.filter((r) => r.job.status === 'completed').length;
  const raceWallet = await one(`SELECT balance FROM credit_wallets WHERE organization_id = $1`, [poor.orgId]);
  check('T9 concurrent jobs cannot overdraw the wallet', raced === 1 && raceWallet.balance === 2, { raced, raceWallet });
  check('T9 wallet matches ledger after race', (await ledgerOk(poor.orgId)).ok, await ledgerOk(poor.orgId));

  console.log('--- Test 10: scheduler');
  const dueA = await one(`INSERT INTO scheduled_jobs (organization_id, type, cron_expression, next_run_at) VALUES ($1, 'ALERT_EVALUATION', '0 3 * * *', NOW() - INTERVAL '1 minute') RETURNING id`, [flaky.orgId]);
  const dueB = await one(`INSERT INTO scheduled_jobs (organization_id, type, cron_expression, next_run_at) VALUES ($1, 'ALERT_EVALUATION', '0 3 * * *', NOW() - INTERVAL '1 minute') RETURNING id`, [B.orgId]);
  const tx = async <T,>(fn: (client: any) => Promise<T>) => { const cl = await restricted.connect(); try { await cl.query('BEGIN'); const r = await fn(cl); await cl.query('COMMIT'); return r; } catch (e) { await cl.query('ROLLBACK'); throw e; } finally { cl.release(); } };
  await Promise.all([runSchedulerTick(tx), runSchedulerTick(tx), runSchedulerTick(tx)]);
  await sleep(800);
  check('T10 concurrent ticks enqueue exactly one job (A)', await count(`jobs WHERE idempotency_key LIKE $1`, [`sched_${dueA.id}_%`]) === 1);
  check('T10 concurrent ticks enqueue exactly one job (B)', await count(`jobs WHERE idempotency_key LIKE $1`, [`sched_${dueB.id}_%`]) === 1);
  check('T10 enqueued job belongs to the schedule\'s tenant', (await one(`SELECT organization_id FROM jobs WHERE idempotency_key LIKE $1`, [`sched_${dueB.id}_%`])).organization_id === B.orgId);
  check('T10 next_run_at advanced', (await one(`SELECT next_run_at > NOW() AS future FROM scheduled_jobs WHERE id = $1`, [dueA.id])).future === true);
  const notDue = await one(`INSERT INTO scheduled_jobs (organization_id, type, cron_expression, next_run_at) VALUES ($1, 'ALERT_EVALUATION', '0 3 * * *', NOW() + INTERVAL '1 day') RETURNING id`, [flaky.orgId]);
  const forced = (await restricted.query(`SELECT rf_scheduler_enqueue($1, '{}') AS id`, [notDue.id])).rows[0].id;
  check('T10 a schedule that is not due cannot be fired', forced === null, forced);

  console.log('--- Log and secret checks');
  await sleep(300);
  const output = logs.join('');
  for (const marker of ['SECRET-MARKER', 'PRIVATE-PROMPT-MARKER']) {
    check(`worker logs contain no ${marker}`, !output.includes(marker), output.split('\n').filter((l) => l.includes(marker)).slice(0, 2));
  }
  check('worker logs show no permission error', !output.includes('permission denied'), output.split('\n').filter((l) => l.includes('permission denied')).slice(0, 5));
  check('worker logs show no RLS violation', !output.includes('row-level security'), output.split('\n').filter((l) => l.includes('row-level security')).slice(0, 5));
  const errors = output.split('\n').filter((l) => l.includes('"level":"error"') && !l.includes('Job failed'));
  check('worker logged no unexpected error', errors.length === 0, errors.slice(0, 5));
} finally {
  worker.kill('SIGKILL');
  await restricted.end();
  const orgs = [A, B, poor, crawlA, flaky, down];
  await q(`DELETE FROM organizations WHERE id = ANY($1::uuid[])`, [orgs.map((o) => o.orgId)]);
  await q(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [orgs.map((o) => o.userId)]);
  await q(`DROP ROLE IF EXISTS ${loginRole}`);
  await owner.end();
}

// Common Crawl import on a tiny graph in the real file format.
{
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { gzipSync } = await import('node:zlib');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const owner2 = new Pool({ connectionString: OWNER_URL, max: 2 });
  const stamp = randomBytes(3).toString('hex');
  const u = (await owner2.query(`INSERT INTO users (email, password_hash, name) VALUES ($1, 'x', 'cc') RETURNING id`, [`cc-${stamp}@example.invalid`])).rows[0].id;
  const o = (await owner2.query(`INSERT INTO organizations (name, slug, owner_id) VALUES ('cc', $1, $2) RETURNING id`, [`cc-${stamp}`, u])).rows[0].id;
  const domain = `shop${stamp}.ir`;
  const p = (await owner2.query(`INSERT INTO projects (organization_id, name, domain, normalized_domain) VALUES ($1, 'cc', $2, $2) RETURNING id`, [o, domain])).rows[0].id;
  const dir = mkdtempSync(join(tmpdir(), 'cc-'));
  const write = (name: string, text: string) => { const f = join(dir, name); writeFileSync(f, gzipSync(text)); return f; };
  const vertices = write('v.gz', `0\tir.${`shop${stamp}`}\t2\n1\tir.linker\t1\n2\tcom.other\t1\n3\tir.unrelated\t1\n`);
  const runImport = (edges: string) => execFileSync(process.execPath, ['--import', 'tsx', 'scripts/ops/import-commoncrawl-backlinks.ts', vertices, write(`e${randomBytes(2).toString('hex')}.gz`, edges), 'test-release'], { env: { ...process.env, DATABASE_URL: OWNER_URL }, encoding: 'utf8' });
  runImport('1\t0\n2\t0\n0\t0\n3\t2\n');
  const links = (await owner2.query(`SELECT source_domain, status, provider FROM backlinks WHERE project_id = $1 ORDER BY 1`, [p])).rows;
  check('Common Crawl import finds referring domains and ignores other edges', links.map((l: any) => l.source_domain).join() === 'linker.ir,other.com' && links.every((l: any) => l.provider === 'commoncrawl'), links);
  await sleep(20);
  runImport('1\t0\n');
  const after = (await owner2.query(`SELECT source_domain, status FROM backlinks WHERE project_id = $1 ORDER BY 1`, [p])).rows;
  check('a domain gone from the next release is marked lost', after[0].status === 'active' && after[1].status === 'lost', after);
  await owner2.query(`DELETE FROM organizations WHERE id = $1`, [o]);
  await owner2.query(`DELETE FROM users WHERE id = $1`, [u]);
  await owner2.end();
}

console.log(`\nRESULT: ${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
