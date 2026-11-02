/**
 * Customer journey over HTTP: real API + real Worker + real PostgreSQL.
 * Websites and providers are mocked inside the Worker only; the API validates customer
 * URLs with real DNS, so URL-based endpoints are exercised through their error paths.
 * Requires WORKER_TEST_DATABASE_URL pointing at a migrated, seeded test database.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';

const OWNER_URL = process.env.WORKER_TEST_DATABASE_URL;
if (!OWNER_URL) { console.log('SKIP: WORKER_TEST_DATABASE_URL not set'); process.exit(0); }
if (!new URL(OWNER_URL).pathname.includes('test')) throw new Error('Refusing to run: database name must contain "test"');

const owner = new Pool({ connectionString: OWNER_URL, max: 3 });
const tag = randomBytes(4).toString('hex');
const secret = randomBytes(32).toString('hex');
const ORIGIN = 'https://app.rankforge.test';
const PORT = 3900 + Math.floor(Math.random() * 50);
const PROD_PORT = PORT + 50;
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
start(['--import', 'tsx', 'src/index.ts'], { NODE_ENV: 'test', PORT: String(PORT), ...apiEnv, ...providers }, 'apps/api');
start(['--import', 'tsx', 'src/index.ts'], { NODE_ENV: 'production', PORT: String(PROD_PORT), TRUST_PROXY_HOPS: '1', ...apiEnv }, 'apps/api');
start(['--import', 'tsx', '--import', './tests/helpers/worker-external-mock.ts', 'apps/worker/src/index.ts'],
  { NODE_ENV: 'test', DATABASE_URL: workerUrl.toString(), WORKER_POLL_INTERVAL: '100', CRAWLER_DELAY: '0', ...providers });

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
  for (const port of [PORT, PROD_PORT]) {
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
  for (const p of procs) p.kill('SIGKILL');
  const users = await owner.query(`SELECT id FROM users WHERE email = ANY($1)`, [created]);
  await owner.query(`DELETE FROM organizations WHERE owner_id = ANY($1)`, [users.rows.map((u) => u.id)]);
  await owner.query(`DELETE FROM users WHERE id = ANY($1)`, [users.rows.map((u) => u.id)]);
  await owner.query(`DROP ROLE IF EXISTS ${roleName}`);
  await owner.query(`DROP ROLE IF EXISTS ${apiRole}`);
  await owner.query(`DROP ROLE IF EXISTS ${systemRole}`);
  await owner.end();
}
console.log(`\nRESULT: ${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
process.exit(0);
