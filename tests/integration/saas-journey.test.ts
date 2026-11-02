/**
 * Customer journey over HTTP: real API + real Worker + real PostgreSQL.
 * Websites and providers are mocked inside the Worker only; the API validates customer
 * URLs with real DNS, so URL-based endpoints are exercised through their error paths.
 * Requires WORKER_TEST_DATABASE_URL pointing at a migrated, seeded test database.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { findToken, startSmtpStub } from '../helpers/smtp-stub.js';

const OWNER_URL = process.env.WORKER_TEST_DATABASE_URL;
if (!OWNER_URL) { console.log('SKIP: WORKER_TEST_DATABASE_URL not set'); process.exit(0); }
if (!new URL(OWNER_URL).pathname.includes('test')) throw new Error('Refusing to run: database name must contain "test"');

const owner = new Pool({ connectionString: OWNER_URL, max: 3 });
const tag = randomBytes(4).toString('hex');
const secret = randomBytes(32).toString('hex');
const ORIGIN = 'https://app.rankforge.test';
const PORT = 3900 + Math.floor(Math.random() * 50);
const PROD_PORT = PORT + 50;
const MAIL_PORT = PORT + 100;
const SMTP_PORT = PORT + 150;
const METRICS_TOKEN = randomBytes(16).toString('hex');
const smtp = startSmtpStub(SMTP_PORT);
const mailEnv = { SMTP_URL: `smtp://127.0.0.1:${SMTP_PORT}`, MAIL_FROM: 'noreply@rankforge.test' };
const baseEnv = { PATH: process.env.PATH, JWT_SECRET: secret, ENCRYPTION_KEY: secret, DATABASE_URL: OWNER_URL, APP_URL: ORIGIN, CORS_ORIGINS: ORIGIN };
const providers = { DATAFORSEO_LOGIN: 'mock', DATAFORSEO_PASSWORD: 'mock', OPENAI_API_KEY: 'mock', PAGESPEED_API_KEY: 'mock' };

const roleName = `rf_journey_${tag}`;
const rolePass = randomBytes(12).toString('hex');
await owner.query(`CREATE ROLE ${roleName} LOGIN PASSWORD '${rolePass}' NOSUPERUSER NOBYPASSRLS IN ROLE rankforge_worker`);
const workerUrl = new URL(OWNER_URL); workerUrl.username = roleName; workerUrl.password = rolePass;
// The API runs exactly as in production: never as the owner.
const apiRole = `rf_journey_api_${tag}`;
const systemRole = `rf_journey_sys_${tag}`;
await owner.query(`CREATE ROLE ${apiRole} LOGIN PASSWORD '${rolePass}' NOSUPERUSER NOBYPASSRLS IN ROLE rankforge_api`);
await owner.query(`CREATE ROLE ${systemRole} LOGIN PASSWORD '${rolePass}' NOSUPERUSER BYPASSRLS IN ROLE rankforge_api_system`);
const asRole = (name: string) => { const u = new URL(OWNER_URL); u.username = name; u.password = rolePass; return u.toString(); };
const apiEnv = { DATABASE_URL: asRole(systemRole), APP_DATABASE_URL: asRole(apiRole) };

const procs: ChildProcess[] = [];
const start = (args: string[], env: object, cwd?: string) => {
  const p = spawn(process.execPath, args, { env: { ...baseEnv, ...env } as any, cwd, stdio: 'ignore' });
  procs.push(p);
  return p;
};
start(['--import', 'tsx', 'src/index.ts'], { NODE_ENV: 'test', PORT: String(PORT), PLATFORM_ADMIN_EMAILS: `root-${tag}@example.test`, METRICS_TOKEN, ...apiEnv, ...providers }, 'apps/api');
start(['--import', 'tsx', 'src/index.ts'], { NODE_ENV: 'test', PORT: String(MAIL_PORT), ...mailEnv, ...apiEnv, ...providers }, 'apps/api');
start(['--import', 'tsx', 'src/index.ts'], { NODE_ENV: 'production', PORT: String(PROD_PORT), TRUST_PROXY_HOPS: '1', ...apiEnv }, 'apps/api');
start(['--import', 'tsx', '--import', './tests/helpers/worker-external-mock.ts', 'apps/worker/src/index.ts'],
  { NODE_ENV: 'test', DATABASE_URL: workerUrl.toString(), WORKER_POLL_INTERVAL: '100', CRAWLER_DELAY: '0', ...mailEnv, ...providers });

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`PASS ${name}`); return; }
  failures.push(name);
  console.log(`FAIL ${name}${detail === undefined ? '' : ` :: ${JSON.stringify(detail)?.slice(0, 300)}`}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function call(method: string, path: string, token?: string | null, body?: unknown, opts: { port?: number; headers?: Record<string, string> } = {}) {
  const res = await fetch(`http://127.0.0.1:${opts.port ?? PORT}/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...(token ? { authorization: `Bearer ${token}` } : {}), ...opts.headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = text;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, data: json?.data, code: json?.error?.code, cookie: res.headers.get('set-cookie') };
}
async function waitFor(fn: () => Promise<boolean>, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await sleep(200); }
  return false;
}
const created: string[] = [];
try {
  for (const port of [PORT, PROD_PORT, MAIL_PORT]) {
    await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${port}/api/v1/health`)).ok; } catch { return false; } }, 30000);
  }

  console.log('--- Authentication');
  const password = 'Str0ng!Passw0rd#22';
  const signup = async (n: string) => {
    const r = await call('POST', '/auth/signup', null, { email: `${n}-${tag}@example.test`, password, name: n });
    created.push(`${n}-${tag}@example.test`);
    return r;
  };
  const a = await signup('alice');
  const b = await signup('bob');
  check('signup creates an account and session', a.status === 201 && !!a.data?.token && !!a.cookie, a.json);
  check('refresh cookie is HttpOnly', /httponly/i.test(a.cookie || ''), a.cookie);
  const T = a.data.token as string;
  const TB = b.data.token as string;
  check('weak password is rejected', (await call('POST', '/auth/signup', null, { email: `w-${tag}@example.test`, password: '123', name: 'w' })).status === 400);
  check('duplicate email is rejected', (await call('POST', '/auth/signup', null, { email: `alice-${tag}@example.test`, password, name: 'a' })).status === 409);
  check('wrong password is rejected', (await call('POST', '/auth/login', null, { email: `alice-${tag}@example.test`, password: 'wrong-password-1' })).status === 401);
  const login = await call('POST', '/auth/login', null, { email: `alice-${tag}@example.test`, password });
  check('login succeeds', login.status === 200 && !!login.data?.token);
  check('unauthenticated request is rejected', (await call('GET', '/projects')).status === 401);
  check('untrusted origin cannot log in', (await call('POST', '/auth/login', null, { email: `alice-${tag}@example.test`, password }, { headers: { origin: 'https://evil.test' } })).status === 403);

  console.log('--- Projects and tenant isolation');
  const pa = await call('POST', '/projects', T, { name: 'A', domain: 'fixture.rankforge.test', country: 'IR', language: 'fa' });
  check('project is created', pa.status === 201, pa.json);
  const pid = pa.data.id as string;
  for (const domain of ['not a domain', 'localhost', 'foo', 'http://', '127.0.0.1']) {
    check(`invalid domain "${domain}" is rejected`, (await call('POST', '/projects', TB, { name: 'x', domain })).status === 400);
  }
  const pb = await call('POST', '/projects', TB, { name: 'B', domain: 'b.rankforge.test' });
  const pidb = pb.data.id as string;
  check('plan project limit is enforced', (await call('POST', '/projects', T, { name: 'x', domain: 'two.rankforge.test' })).code === 'LIMIT_REACHED');
  check('project can be renamed', (await call('PATCH', `/projects/${pid}`, T, { name: 'Renamed' })).data?.name === 'Renamed');
  const crossRoutes: Array<[string, string, unknown?]> = [
    ['GET', `/projects/${pidb}`], ['PATCH', `/projects/${pidb}`, { name: 'hack' }], ['DELETE', `/projects/${pidb}`],
    ['GET', `/projects/${pidb}/audit/findings`], ['GET', `/projects/${pidb}/audit/score`], ['GET', `/projects/${pidb}/keywords`],
    ['POST', `/projects/${pidb}/keywords`, { keywords: ['x'] }], ['GET', `/projects/${pidb}/rankings`], ['POST', `/projects/${pidb}/crawl`, {}],
    ['GET', `/projects/${pidb}/reports`], ['POST', `/projects/${pidb}/reports`, { type: 'seo', format: 'json' }], ['GET', `/projects/${pidb}/alerts`],
    ['GET', `/projects/${pidb}/jobs`], ['GET', `/projects/${pidb}/backlinks`], ['GET', `/projects/${pidb}/competitors`],
  ];
  for (const [m, p, body] of crossRoutes) {
    const r = await call(m, p, T, body);
    check(`cross-tenant ${m} ${p.replace(pidb, ':b')} returns 404`, r.status === 404, { status: r.status });
  }
  check('project B is unchanged', (await call('GET', `/projects/${pidb}`, TB)).data?.name === 'B');
  check('project list holds only own projects', (await call('GET', '/projects', T)).data?.every((p: any) => p.id === pid));
  check('schedule cannot target another tenant\'s project', (await call('POST', '/scheduler/jobs', T, { type: 'RANK_CHECK', cronExpression: '0 3 * * *', projectId: pidb })).status === 404);
  const stats = await call('GET', '/admin/stats', T);
  check('organization stats expose no platform totals', stats.status === 200 && stats.data.orgs === undefined && Number(stats.data.projects) === 1, stats.data);

  console.log('--- Crawl, audit and score');
  const crawl = await call('POST', `/projects/${pid}/crawl`, T, { maxPages: 5 });
  check('crawl is accepted', crawl.status === 201, crawl.json);
  check('crawl above the maximum is rejected', (await call('POST', `/projects/${pid}/crawl`, T, { maxPages: 5000 })).status === 400);
  const finished = await waitFor(async () => (await call('GET', `/projects/${pid}/jobs`, T)).data?.every((j: any) => ['completed', 'dead_letter'].includes(j.status)));
  check('all crawl jobs finish', finished);
  const findings = await call('GET', `/projects/${pid}/audit/findings`, T);
  const score = await call('GET', `/projects/${pid}/audit/score`, T);
  check('findings show only the latest run', findings.data?.length === new Set(findings.data?.map((f: any) => f.ruleId)).size, findings.data?.map((f: any) => f.ruleId));
  check('score endpoint agrees with the stored project score', score.data?.overall === score.data?.projectSeoScore, score.data);
  const wallet = await call('GET', '/billing/credits', T);
  const usage = await call('GET', '/billing/usage', T);
  check('wallet matches its transactions', wallet.data.balance === wallet.data.totalGranted + usage.data.reduce((s: number, t: any) => s + t.amount, 0), { wallet: wallet.data, usage: usage.data.length });

  console.log('--- Keywords, rank, content, reports, alerts');
  check('keywords are added', (await call('POST', `/projects/${pid}/keywords`, T, { keywords: ['mock keyword', 'کلمه تست'] })).status === 201);
  check('plan keyword limit is enforced', (await call('POST', `/projects/${pid}/keywords`, T, { keywords: Array.from({ length: 12 }, (_, i) => `k${i}`) })).code === 'LIMIT_REACHED');
  check('rank check is queued', (await call('POST', `/projects/${pid}/rankings/check`, T, {})).status === 201);
  check('rankings include the keyword text', await waitFor(async () => (await call('GET', `/projects/${pid}/rankings`, T)).data?.some((r: any) => r.keyword === 'mock keyword')));
  const report = await call('POST', `/projects/${pid}/reports`, T, { type: 'seo', format: 'html' });
  check('report is queued', report.status === 201, report.json);
  check('report completes', await waitFor(async () => (await call('GET', `/projects/${pid}/reports`, T)).data?.some((r: any) => r.status === 'completed')));
  const alert = await call('POST', `/projects/${pid}/alerts`, T, { title: 'a', message: 'm', type: 'rank_drop', severity: 'notice' });
  check('customer can create an alert', alert.status === 201, alert.json);
  check('brief is queued', (await call('POST', `/projects/${pid}/content/briefs`, T, { title: 't', targetKeyword: 'k' })).status === 201);

  console.log('--- Quotas');
  const orgId = a.data.user.organizationId as string;
  await owner.query(`INSERT INTO ai_usage (organization_id, provider, model, input_tokens, output_tokens, operation, idempotency_key) SELECT $1, 'x', 'x', 1, 1, 'x', 'q' || g || $2 FROM generate_series(1, 200) g`, [orgId, tag]);
  check('AI quota blocks briefs', (await call('POST', `/projects/${pid}/content/briefs`, T, { title: 't', targetKeyword: 'k' })).code === 'LIMIT_REACHED');
  check('AI quota blocks GEO checks', (await call('POST', `/projects/${pid}/geo/check`, T, {})).code === 'LIMIT_REACHED');
  await owner.query(`UPDATE crawl_runs SET crawled_pages = 100000 WHERE id = (SELECT id FROM crawl_runs WHERE organization_id = $1 LIMIT 1)`, [orgId]);
  check('monthly page quota blocks crawls', (await call('POST', `/projects/${pid}/crawl`, T, {})).code === 'LIMIT_REACHED');
  await owner.query(`UPDATE crawl_runs SET crawled_pages = 0 WHERE organization_id = $1`, [orgId]);
  await owner.query(`UPDATE credit_wallets SET balance = 4 WHERE organization_id = $1`, [orgId]);
  check('low balance blocks crawls', (await call('POST', `/projects/${pid}/crawl`, T, {})).code === 'INSUFFICIENT_CREDITS');

  console.log('--- Input and error handling');
  check('SSRF URL is a 400, not a 500', (await call('POST', `/projects/${pid}/pagespeed/check`, T, { url: 'http://169.254.169.254/' })).status === 400);
  check('webhook to a private address is a 400', (await call('POST', '/webhooks', T, { url: 'http://127.0.0.1:5432/x', events: ['crawl.completed'] })).status === 400);
  check('bad cron is rejected', (await call('POST', '/scheduler/jobs', T, { type: 'RANK_CHECK', cronExpression: 'nope', projectId: pid })).status === 400);
  check('every-minute schedule is rejected', (await call('POST', '/scheduler/jobs', T, { type: 'SITE_CRAWL', cronExpression: '* * * * *', projectId: pid })).status === 400);
  check('unknown job type is rejected', (await call('POST', '/scheduler/jobs', T, { type: 'WAT', cronExpression: '0 3 * * *' })).status === 400);
  check('valid schedule is accepted', (await call('POST', '/scheduler/jobs', T, { type: 'RANK_CHECK', cronExpression: '0 3 * * *', timezone: 'Asia/Tehran', projectId: pid })).status === 201);
  check('unavailable backup says so instead of pretending', (await call('POST', '/backups/trigger', T, {})).status === 501);

  console.log('--- Production behaviour');
  const prod = { port: PROD_PORT };
  const internal = await call('POST', '/auth/login', null, { email: 'x', password: 'y' }, { ...prod, headers: { 'x-forwarded-proto': 'https', 'x-forwarded-for': '198.51.100.9' } });
  check('production rejects bad input cleanly', internal.status === 400, internal.json);
  for (let i = 0; i < 11; i++) {
    await call('POST', '/auth/login', null, { email: `nobody-${i}@example.test`, password: 'wrong-password-1' }, { ...prod, headers: { 'x-forwarded-proto': 'https', 'x-forwarded-for': '198.51.100.1' } });
  }
  const limited = await call('POST', '/auth/login', null, { email: 'n@example.test', password: 'wrong-password-1' }, { ...prod, headers: { 'x-forwarded-proto': 'https', 'x-forwarded-for': '198.51.100.1' } });
  check('auth rate limit stops one client', limited.status === 429, limited.status);
  const other = await call('POST', '/auth/login', null, { email: 'n@example.test', password: 'wrong-password-1' }, { ...prod, headers: { 'x-forwarded-proto': 'https', 'x-forwarded-for': '198.51.100.2' } });
  check('auth rate limit does not block other customers', other.status === 401, other.status);

  console.log('--- Team, organizations and API keys as the restricted role');
  const carol = await signup('carol');
  const TC = carol.data.token as string;
  const added = await call('POST', '/organizations/current/members', TB, { email: `carol-${tag}@example.test`, role: 'Viewer' });
  check('plan user limit is enforced', added.code === 'LIMIT_REACHED', added.json);
  await owner.query(`UPDATE organizations SET plan = 'STARTER' WHERE id = $1`, [b.data.user.organizationId]);
  const joined = await call('POST', '/organizations/current/members', TB, { email: `carol-${tag}@example.test`, role: 'Viewer' });
  check('an existing user can be added to a team', joined.status < 300, joined.json);
  const carolOrgs = await call('GET', '/auth/me', TC);
  check('a member sees all their organizations', carolOrgs.data?.organizations?.length === 2, carolOrgs.data?.organizations);
  const switched = await call('POST', '/auth/organization', TC, { organizationId: b.data.user.organizationId });
  check('a member can switch organization', switched.status === 200 && !!switched.data?.token, switched.json);
  const TC2 = switched.data?.token as string;
  const carolMe = await call('GET', '/auth/me', TC2);
  check('the new session belongs to the new organization', carolMe.data?.user?.organizationId === b.data.user.organizationId && carolMe.data?.user?.role === 'Viewer', carolMe.data?.user);
  check('a Viewer cannot create projects', (await call('POST', '/projects', TC2, { name: 'v', domain: 'viewer.rankforge.test' })).status === 403);
  check('a stranger cannot switch into another organization', (await call('POST', '/auth/organization', T, { organizationId: b.data.user.organizationId })).status === 403);
  const members = await call('GET', '/organizations/current/members', TB);
  check('team list shows colleagues', members.data?.length === 2, members.data);
  const key = await call('POST', '/api-keys', T, { name: 'k', scopes: ['read'] });
  check('API key is created', key.status === 201 && !!(key.data?.key || key.data?.apiKey || key.data?.rawKey), key.json);
  const raw = key.data?.key || key.data?.apiKey || key.data?.rawKey;
  check('API key reads its own tenant', (await call('GET', '/projects', raw)).data?.[0]?.id === pid);
  check('read-only API key cannot write', (await call('POST', `/projects/${pid}/keywords`, raw, { keywords: ['z'] })).status === 403);
  check('API key cannot manage the account', (await call('GET', '/billing/credits', raw)).status === 403);
  check('API key cannot reach another tenant', (await call('GET', `/projects/${pidb}`, raw)).status === 404);
  const changed = await call('POST', '/auth/password', TC2, { currentPassword: password, password: 'An0ther!Passw0rd#33' });
  check('password can be changed', changed.status === 200, changed.json);
  const exported = await call('GET', '/gdpr/export', T);
  check('personal data export works', exported.status === 200 && exported.data?.organizations?.length >= 1, Object.keys(exported.data || {}));

  console.log('--- Findings and schedules');
  const firstFinding = (await call('GET', `/projects/${pid}/audit/findings`, T)).data?.[0];
  const fixed = await call('PATCH', `/projects/${pid}/audit/findings/${firstFinding.id}`, T, { status: 'fixed' });
  check('a finding can be marked fixed', fixed.data?.status === 'fixed', fixed.json);
  check('another tenant cannot change a finding', (await call('PATCH', `/projects/${pidb}/audit/findings/${firstFinding.id}`, TB, { status: 'ignored' })).status === 404);
  check('invalid finding status is rejected', (await call('PATCH', `/projects/${pid}/audit/findings/${firstFinding.id}`, T, { status: 'x' })).status === 400);
  const sched = await call('POST', '/scheduler/jobs', T, { type: 'ALERT_EVALUATION', cronExpression: '5 3 * * *' });
  check('schedule can be paused', (await call('PATCH', `/scheduler/jobs/${sched.data.id}`, T, { enabled: false })).data?.enabled === false);
  check('another tenant cannot touch a schedule', (await call('DELETE', `/scheduler/jobs/${sched.data.id}`, TB)).status === 404);
  check('schedule can be deleted', (await call('DELETE', `/scheduler/jobs/${sched.data.id}`, T)).status === 200);

  console.log('--- Webhook delivery (mock receiver)');
  await owner.query(`UPDATE credit_wallets SET balance = 50 WHERE organization_id = $1`, [orgId]);
  const hook = await owner.query(`INSERT INTO webhooks (organization_id, url, events, secret_hash, secret_prefix, status, active) VALUES ($1, 'https://hooks.rankforge.test/in', '["crawl.completed"]', 'journey-secret-hash', 'x', 'active', true) RETURNING id`, [orgId]);
  const hookCrawl = await call('POST', `/projects/${pid}/crawl`, T, { maxPages: 2 });
  check('crawl with a subscribed webhook runs', hookCrawl.status === 201, hookCrawl.json);
  const delivered = await waitFor(async () => (await owner.query(`SELECT status FROM webhook_deliveries WHERE webhook_id = $1`, [hook.rows[0].id])).rows[0]?.status === 'delivered', 30000);
  const deliveryRow = (await owner.query(`SELECT status, attempts, response_code, event FROM webhook_deliveries WHERE webhook_id = $1`, [hook.rows[0].id])).rows[0];
  check('event is delivered with a valid signature after a retry', delivered && deliveryRow.attempts === 2 && deliveryRow.response_code === 200 && deliveryRow.event === 'crawl.completed', deliveryRow);
  const testSend = await call('POST', `/webhooks/${hook.rows[0].id}/test`, T, {});
  check('test delivery is queued and arrives', testSend.status === 201 && await waitFor(async () => (await owner.query(`SELECT status FROM webhook_deliveries WHERE id = $1`, [testSend.data.id])).rows[0]?.status === 'delivered'), testSend.json);
  check('another tenant cannot test this webhook', (await call('POST', `/webhooks/${hook.rows[0].id}/test`, TB, {})).status === 404);

  console.log('--- Email over the SMTP protocol (local stub, not a real provider)');
  const mailCall = (m: string, p: string, t?: string | null, body?: unknown) => call(m, p, t, body, { port: MAIL_PORT });
  const dave = await mailCall('POST', '/auth/signup', null, { email: `dave-${tag}@example.test`, password, name: 'dave' });
  created.push(`dave-${tag}@example.test`);
  const TD = dave.data.token as string;
  const verifyMail = () => smtp.mails.find((m) => m.to === `dave-${tag}@example.test` && findToken(m));
  check('signup sends a verification email', await waitFor(async () => !!verifyMail(), 8000));
  check('/auth/me reports the address as unverified', (await mailCall('GET', '/auth/me', TD)).data?.user?.emailVerified === false);
  const daveProject = await mailCall('POST', '/projects', TD, { name: 'D', domain: 'dave.rankforge.test' });
  check('unverified account can still create a project', daveProject.status === 201);
  check('unverified project gets no billable crawl', (await mailCall('GET', `/projects/${daveProject.data.id}/jobs`, TD)).data?.length === 0);
  check('unverified account cannot run a crawl', (await mailCall('POST', `/projects/${daveProject.data.id}/crawl`, TD, {})).code === 'EMAIL_NOT_VERIFIED');
  check('a bad verification token is rejected', (await mailCall('POST', '/auth/verify-email', null, { token: 'a'.repeat(64) })).status === 400);
  const vToken = findToken(verifyMail()!)!;
  check('the emailed link verifies the address', (await mailCall('POST', '/auth/verify-email', null, { token: vToken })).status === 200);
  check('a verification link works only once', (await mailCall('POST', '/auth/verify-email', null, { token: vToken })).status === 400);
  check('verified account can run a crawl', (await mailCall('POST', `/projects/${daveProject.data.id}/crawl`, TD, { maxPages: 1 })).status === 201);
  smtp.mails.length = 0;
  const forgot = await mailCall('POST', '/auth/forgot-password', null, { email: `dave-${tag}@example.test` });
  check('password recovery request is accepted', forgot.status < 300, forgot.json);
  check('recovery email arrives', await waitFor(async () => smtp.mails.some((m) => !!findToken(m)), 8000));
  const rToken = findToken(smtp.mails.find((m) => !!findToken(m))!)!;
  const newPassword = 'Recov3red!Passw0rd#44';
  const resetRes = await mailCall('POST', '/auth/reset-password', null, { token: rToken, password: newPassword });
  check('password reset succeeds', resetRes.status === 200, resetRes.json);
  check('old sessions die after a reset', (await mailCall('GET', '/auth/me', TD)).status === 401);
  check('old password stops working', (await mailCall('POST', '/auth/login', null, { email: `dave-${tag}@example.test`, password })).status === 401);
  check('new password works', (await mailCall('POST', '/auth/login', null, { email: `dave-${tag}@example.test`, password: newPassword })).status === 200);
  check('a reset link works only once', (await mailCall('POST', '/auth/reset-password', null, { token: rToken, password: newPassword })).status === 400);
  smtp.mails.length = 0;
  const alertRun = await owner.query(`INSERT INTO crawl_runs (organization_id, project_id, status) VALUES ($1, $2, 'completed') RETURNING id`, [orgId, pid]);
  await owner.query(`INSERT INTO audit_findings (organization_id, project_id, crawl_run_id, rule_id, severity, category, title, description, recommendation, status) VALUES ($1, $2, $3, 'missing_title', 'critical', 'metadata', 'T', 'D', 'R', 'open')`, [orgId, pid, alertRun.rows[0].id]);
  await owner.query(`UPDATE alerts SET read = true WHERE organization_id = $1`, [orgId]);
  await owner.query(`INSERT INTO jobs (organization_id, type, idempotency_key) VALUES ($1, 'ALERT_EVALUATION', $2)`, [orgId, `journey_${tag}`]);
  check('a critical alert emails the organization owner', await waitFor(async () => smtp.mails.some((m) => m.to === `alice-${tag}@example.test`), 10000), smtp.mails.map((m) => m.to));

  console.log('--- Scheduled jobs and plan quota');
  await owner.query(`UPDATE crawl_runs SET crawled_pages = 100000 WHERE id = $1`, [alertRun.rows[0].id]);
  await owner.query(`INSERT INTO scheduled_jobs (organization_id, project_id, type, cron_expression, next_run_at) VALUES ($1, $2, 'SITE_CRAWL', '0 3 * * *', NOW() - INTERVAL '1 minute')`, [orgId, pid]);
  const blockedSched = await waitFor(async () => (await owner.query(`SELECT error_code FROM jobs WHERE organization_id = $1 AND idempotency_key LIKE 'sched_%' AND status = 'dead_letter'`, [orgId])).rows[0]?.error_code === 'QUOTA_EXCEEDED', 40000);
  check('a schedule cannot exceed the monthly quota', blockedSched);
  await owner.query(`UPDATE crawl_runs SET crawled_pages = 0 WHERE id = $1`, [alertRun.rows[0].id]);

  console.log('--- Platform administration');
  const rootSignup = await signup('root');
  const TR = rootSignup.data.token as string;
  check('/auth/me tells the operator apart', (await call('GET', '/auth/me', TR)).data?.user?.platformAdmin === true && (await call('GET', '/auth/me', T)).data?.user?.platformAdmin === false);
  check('a customer cannot see the platform panel', (await call('GET', '/platform/overview', T)).status === 404);
  check('API key cannot reach the platform panel', (await call('GET', '/platform/overview', raw)).status === 403);
  const overview = await call('GET', '/platform/overview', TR);
  check('operator sees platform totals', overview.status === 200 && overview.data.organizations >= 4 && Array.isArray(overview.data.plans), overview.json);
  const listed = await call('GET', `/platform/organizations?search=${encodeURIComponent(`alice-${tag}`)}`, TR);
  check('operator can find a customer', listed.data?.length === 1 && listed.data[0].id === orgId, listed.json);
  const requestId = '11111111-1111-4111-8111-' + randomBytes(6).toString('hex');
  const grantBody = { amount: 25, reason: 'support', requestId };
  const walletBefore = (await call('GET', '/billing/credits', T)).data.balance;
  check('operator can grant credits', (await call('POST', `/platform/organizations/${orgId}/credits`, TR, grantBody)).data?.balance === walletBefore + 25);
  check('a repeated grant is not applied twice', (await call('POST', `/platform/organizations/${orgId}/credits`, TR, grantBody)).data?.duplicate === true && (await call('GET', '/billing/credits', T)).data.balance === walletBefore + 25);
  check('operator can change a plan', (await call('PATCH', `/platform/organizations/${orgId}`, TR, { plan: 'PRO' })).data?.plan === 'PRO');
  const auditRows = await owner.query(`SELECT count(*)::int AS n FROM audit_logs WHERE organization_id = $1 AND action LIKE 'platform.%'`, [orgId]);
  check('operator actions are audited', auditRows.rows[0].n >= 2, auditRows.rows[0]);
  check('operator can suspend a customer', (await call('PATCH', `/platform/organizations/${orgId}`, TR, { suspended: true })).data?.suspendedAt != null);
  check('a suspended customer is blocked', (await call('GET', '/projects', T)).code === 'ACCOUNT_SUSPENDED');
  const suspendedJob = await owner.query(`INSERT INTO jobs (organization_id, type, idempotency_key) VALUES ($1, 'ALERT_EVALUATION', $2) RETURNING id`, [orgId, `suspended_${tag}`]);
  await sleep(1500);
  check('a suspended customer\'s jobs do not run', (await owner.query(`SELECT status FROM jobs WHERE id = $1`, [suspendedJob.rows[0].id])).rows[0].status === 'pending');
  check('operator can lift a suspension', (await call('PATCH', `/platform/organizations/${orgId}`, TR, { suspended: false })).data?.suspendedAt === null && (await call('GET', '/projects', T)).status === 200);

  console.log('--- Metrics');
  const metrics = await fetch(`http://127.0.0.1:${PORT}/api/v1/metrics`, { headers: { authorization: `Bearer ${METRICS_TOKEN}` } });
  const metricsText = await metrics.text();
  check('metrics are served with the token', metrics.status === 200 && metricsText.includes('rankforge_jobs{status="completed"}') && metricsText.includes('rankforge_http_requests_total'), metricsText.slice(0, 200));
  check('metrics are hidden without the token', (await fetch(`http://127.0.0.1:${PORT}/api/v1/metrics`)).status === 404);

  console.log('--- RLS as the safety net');
  const appPool = new Pool({ connectionString: asRole(apiRole), max: 3 });
  const rlsClient = await appPool.connect();
  const unfiltered = await (async () => {
    await rlsClient.query('BEGIN');
    await rlsClient.query(`SELECT set_config('app.current_organization_id', $1, true), set_config('app.current_user_id', $2, true)`, [a.data.user.organizationId, a.data.user.id]);
    const projects = (await rlsClient.query('SELECT organization_id FROM projects')).rows;
    const users = (await rlsClient.query('SELECT id FROM users')).rows;
    await rlsClient.query('ROLLBACK');
    return { projects, users };
  })();
  check('a query with no filter stays inside the tenant', unfiltered.projects.length >= 1 && unfiltered.projects.every((r) => r.organization_id === a.data.user.organizationId), unfiltered.projects.length);
  check('a query with no filter cannot list other tenants\' users', unfiltered.users.length === 1 && unfiltered.users[0].id === a.data.user.id, unfiltered.users.length);
  const noContext = await appPool.query('SELECT count(*)::int AS n FROM projects');
  check('no tenant context means no rows', noContext.rows[0].n === 0, noContext.rows[0]);
  const refused = async (sql: string) => { try { await appPool.query(sql); return false; } catch (e: any) { return e.code === '42501'; } };
  check('API role cannot read reset tokens', await refused('SELECT 1 FROM password_reset_tokens'));
  check('API role cannot alter schema', await refused('ALTER TABLE projects DISABLE ROW LEVEL SECURITY'));
  check('API role cannot truncate', await refused('TRUNCATE alerts'));
  rlsClient.release();
  await appPool.end();

  console.log('--- Session end and account lifecycle');
  check('project is soft-deleted', (await call('DELETE', `/projects/${pidb}`, TB)).status === 200);
  check('deleted project is gone', (await call('GET', `/projects/${pidb}`, TB)).status === 404);
  check('logout succeeds', (await call('POST', '/auth/logout', T, {})).status === 200);
  check('token stops working after logout', (await call('GET', '/auth/me', T)).status === 401);
} finally {
  smtp.server.close();
  for (const p of procs) p.kill('SIGKILL');
  const users = await owner.query(`SELECT id FROM users WHERE email = ANY($1)`, [created]);
  await owner.query(`DELETE FROM organizations WHERE owner_id = ANY($1)`, [users.rows.map((u) => u.id)]);
  await owner.query(`DELETE FROM password_reset_tokens WHERE user_id = ANY($1)`, [users.rows.map((u) => u.id)]);
  await owner.query(`DELETE FROM users WHERE id = ANY($1)`, [users.rows.map((u) => u.id)]);
  await owner.query(`DROP ROLE IF EXISTS ${roleName}`);
  await owner.query(`DROP ROLE IF EXISTS ${apiRole}`);
  await owner.query(`DROP ROLE IF EXISTS ${systemRole}`);
  await owner.end();
}
console.log(`\nRESULT: ${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
process.exit(0);
