/**
 * Customer journey over HTTP: real API + real Worker + real PostgreSQL.
 * Websites and providers are mocked inside the Worker only; the API validates customer
 * URLs with real DNS, so URL-based endpoints are exercised through their error paths.
 * Requires WORKER_TEST_DATABASE_URL pointing at a migrated, seeded test database.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
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
// fetch() refuses some ports (4045 and 4190 fall in the ranges below), so those offsets are skipped.
const FETCH_BLOCKED_PORTS = new Set([4045, 4190]);
const PORT = (() => {
  for (;;) {
    const port = 3900 + Math.floor(Math.random() * 50);
    if (![0, 50, 100, 150, 200, 250].some((offset) => FETCH_BLOCKED_PORTS.has(port + offset))) return port;
  }
})();
const PROD_PORT = PORT + 50;
const MAIL_PORT = PORT + 100;
const SMTP_PORT = PORT + 150;
const METRICS_TOKEN = randomBytes(16).toString('hex');
const smtp = startSmtpStub(SMTP_PORT);
const PAY_API_PORT = PORT + 200;
const GATEWAY_PORT = PORT + 250;
// A local stand-in for the Zarinpal REST API: proves our flow, not Zarinpal itself.
const gateway = { paid: new Set<string>(), verified: new Set<string>(), amounts: new Map<string, number>(), requests: [] as any[], verifyCalls: 0, down: false, seq: 0 };
const gatewayServer = createHttpServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    res.setHeader('content-type', 'application/json');
    if (gateway.down) { res.statusCode = 502; return res.end('{}'); }
    if (req.url === '/pg/v4/payment/request.json') {
      gateway.requests.push(body);
      const authority = `A${String(++gateway.seq).padStart(35, '0')}`;
      gateway.amounts.set(authority, body.amount);
      return res.end(JSON.stringify({ data: { code: 100, authority, message: 'Success' }, errors: [] }));
    }
    if (req.url === '/pg/v4/payment/verify.json') {
      gateway.verifyCalls++;
      const ok = gateway.paid.has(body.authority) && gateway.amounts.get(body.authority) === body.amount;
      if (!ok) return res.end(JSON.stringify({ data: [], errors: { code: -51, message: 'not paid' } }));
      const code = gateway.verified.has(body.authority) ? 101 : 100;
      gateway.verified.add(body.authority);
      return res.end(JSON.stringify({ data: { code, ref_id: 900000 + gateway.seq, card_pan: '502229******5995' }, errors: [] }));
    }
    res.statusCode = 404; res.end('{}');
  });
});
gatewayServer.listen(GATEWAY_PORT, '127.0.0.1');
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
start(['--import', 'tsx', 'src/index.ts'], { NODE_ENV: 'test', PORT: String(PAY_API_PORT), APP_URL: `http://127.0.0.1:${PAY_API_PORT}`, CORS_ORIGINS: ORIGIN, ZARINPAL_MERCHANT_ID: 'test-merchant', ZARINPAL_API_BASE: `http://127.0.0.1:${GATEWAY_PORT}`, BILLING_MAINTENANCE_MS: '500', PAYMENT_RECONCILE_AFTER_SECONDS: '1', ...mailEnv, ...apiEnv, ...providers }, 'apps/api');
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
  for (const port of [PORT, PROD_PORT, MAIL_PORT, PAY_API_PORT]) {
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
    ['POST', `/projects/${pidb}/integrations/gsc/sync`, {}],
    ['GET', `/projects/${pidb}/fixes`], ['POST', `/projects/${pidb}/fixes/suggest`, {}], ['GET', `/projects/${pidb}/wp/pending`],
    ['POST', `/projects/${pidb}/wp/images`, { images: [] }],
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
  await waitFor(async () => (await call('GET', `/projects/${pid}/jobs`, T)).data?.every((j: any) => ['completed', 'dead_letter'].includes(j.status)));
  const crawl = await call('POST', `/projects/${pid}/crawl`, T, { maxPages: 5 });
  check('crawl is accepted', crawl.status === 201, crawl.json);
  const repeat = await call('POST', `/projects/${pid}/crawl`, T, { maxPages: 5 });
  check('a second crawl is refused while one is running', repeat.status === 409 && repeat.code === 'CRAWL_ALREADY_RUNNING', repeat.json);
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
  const geoRun = await call('POST', `/projects/${pid}/geo/check`, T, {});
  const geoJobs = (await call('GET', `/projects/${pid}/jobs`, T)).data ?? [];
  check('GEO question does not name the brand', geoRun.status === 400 ? geoRun.code === 'KEYWORDS_REQUIRED' : !JSON.stringify(geoJobs.find((j: any) => j.type === 'AI_VISIBILITY_CHECK')?.payload ?? '').includes('.'), geoRun.json);
  check('brief is queued', (await call('POST', `/projects/${pid}/content/briefs`, T, { title: 't', targetKeyword: 'k' })).status === 201);

  console.log('--- Site fixes and the WordPress plugin flow');
  const lastRun = (await owner.query(`SELECT id FROM crawl_runs WHERE project_id = $1 AND status = 'completed' ORDER BY created_at DESC LIMIT 1`, [pid])).rows[0];
  await owner.query(`INSERT INTO crawl_pages (crawl_run_id, organization_id, project_id, url, status_code, content_type, title, h1, meta_description)
    VALUES ($1, (SELECT organization_id FROM projects WHERE id = $2), $2, 'https://fixture.rankforge.test/tours', 200, 'text/html', 'Tours of the city for families', 'Tours', NULL)`, [lastRun.id, pid]);
  const suggest = await call('POST', `/projects/${pid}/fixes/suggest`, T, {});
  check('fix suggestions are queued', suggest.status === 201, suggest.json);
  check('a second suggestion run waits for the first', [409, 201].includes((await call('POST', `/projects/${pid}/fixes/suggest`, T, {})).status));
  const proposed = async () => ((await call('GET', `/projects/${pid}/fixes`, T)).data?.fixes ?? []).find((f: any) => f.pageUrl === 'https://fixture.rankforge.test/tours' && f.kind === 'meta_description');
  check('AI writes a description for the page without one', await waitFor(async () => !!(await proposed()), 20000));
  const fix = await proposed();
  const pluginKey = (await call('POST', '/api-keys', T, { name: 'wp', scopes: ['read', 'write'] })).data?.key as string;
  const readOnlyKey = (await call('POST', '/api-keys', T, { name: 'wp-read', scopes: ['read'] })).data?.key as string;
  check('a read-only key cannot connect the plugin', (await call('GET', `/projects/${pid}/wp/pending`, readOnlyKey)).status === 403);
  check('the plugin key cannot approve changes', (await call('PATCH', `/projects/${pid}/fixes/${fix.id}`, pluginKey, { action: 'approve' })).status === 403);
  check('nothing reaches the site before approval', !((await call('GET', `/projects/${pid}/wp/pending`, pluginKey)).data?.fixes ?? []).some((f: any) => f.id === fix.id));
  check('a value with HTML is refused', (await call('PATCH', `/projects/${pid}/fixes/${fix.id}`, T, { action: 'approve', proposedValue: '<script>x</script>' })).status === 400);
  const edited = 'City tours for families with local guides, small groups and flexible times every day of the week.';
  check('the customer can edit and approve', (await call('PATCH', `/projects/${pid}/fixes/${fix.id}`, T, { action: 'approve', proposedValue: edited })).data?.status === 'approved');
  const pending = await call('GET', `/projects/${pid}/wp/pending?version=1.0.0`, pluginKey);
  check('the plugin receives the approved value', pending.data?.fixes?.some((f: any) => f.id === fix.id && f.value === edited), pending.json);
  check('the plugin check-in is recorded', (await call('GET', `/projects/${pid}/fixes`, T)).data?.plugin?.version === '1.0.0');
  check('the plugin reports it applied', (await call('POST', `/projects/${pid}/wp/results`, pluginKey, { results: [{ id: fix.id, status: 'applied', previousValue: 'old' }] })).data?.updated === 1);
  check('a repeated report changes nothing', (await call('POST', `/projects/${pid}/wp/results`, pluginKey, { results: [{ id: fix.id, status: 'applied' }] })).data?.updated === 0);
  check('a rollback can be requested', (await call('PATCH', `/projects/${pid}/fixes/${fix.id}`, T, { action: 'rollback' })).data?.status === 'rollback_requested');
  check('the plugin receives the old value for rollback', (await call('GET', `/projects/${pid}/wp/pending`, pluginKey)).data?.fixes?.some((f: any) => f.id === fix.id && f.previousValue === 'old'));
  check('the plugin reports the rollback', (await call('POST', `/projects/${pid}/wp/results`, pluginKey, { results: [{ id: fix.id, status: 'rolled_back' }] })).data?.updated === 1);
  const image = { pageUrl: 'https://fixture.rankforge.test/tours', src: 'https://fixture.rankforge.test/a.jpg', proposedValue: 'City tour bus' };
  check('the plugin proposes image alt text', (await call('POST', `/projects/${pid}/wp/images`, pluginKey, { images: [image] })).data?.created === 1);
  check('the same image is proposed once', (await call('POST', `/projects/${pid}/wp/images`, pluginKey, { images: [image] })).data?.created === 0);

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
  // One client over the general limit is covered by the auth limiter below; ordinary browsing must not hit it.
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

  console.log('--- Zarinpal payments in toman (local gateway stand-in)');
  const pay = (m: string, p: string, t?: string | null, body?: unknown) => call(m, p, t, body, { port: PAY_API_PORT });
  const callback = async (authority: string, status: string) => {
    const res = await fetch(`http://127.0.0.1:${PAY_API_PORT}/api/v1/billing/zarinpal/callback?Authority=${authority}&Status=${status}`, { redirect: 'manual' });
    return res.headers.get('location') || '';
  };
  const erin = await pay('POST', '/auth/signup', null, { email: `erin-${tag}@example.test`, password, name: 'erin' });
  created.push(`erin-${tag}@example.test`);
  const tokenE = erin.data.token as string;
  await owner.query(`UPDATE users SET email_verified = true WHERE id = $1`, [erin.data.user.id]);
  const orgE = erin.data.user.organizationId as string;
  const orgState = async () => (await owner.query(`SELECT plan, subscription_status, subscription_current_period_end AS end FROM organizations WHERE id = $1`, [orgE])).rows[0];
  const balance = async () => (await pay('GET', '/billing/credits', tokenE)).data.balance as number;
  const plans = (await pay('GET', '/billing/plans')).data;
  const pro = plans.find((p: any) => p.id === 'PRO');
  const starter = plans.find((p: any) => p.id === 'STARTER');
  check('plans are priced in toman', pro.priceMonthlyToman > 0 && pro.priceAnnualToman > pro.priceMonthlyToman, pro);
  check('online payment is reported as available', (await pay('GET', '/billing/subscription', tokenE)).data?.paymentsConfigured === true);
  check('a free plan cannot be bought', (await pay('POST', '/billing/checkout', tokenE, { planId: 'FREE', interval: 'month' })).status === 400);

  const first = await pay('POST', '/billing/checkout', tokenE, { planId: 'STARTER', interval: 'month' });
  check('checkout returns a gateway link', first.status === 200 && /\/pg\/StartPay\/A\d+$/.test(first.data?.url), first.json);
  const authority1 = first.data.url.split('/').pop();
  const sentRequest = gateway.requests.at(-1);
  check('the gateway is asked for the server price in toman', sentRequest.amount === starter.priceMonthlyToman && sentRequest.currency === 'IRT' && sentRequest.merchant_id === 'test-merchant', sentRequest);
  check('the gateway returns customers to the callback', sentRequest.callback_url.endsWith('/api/v1/billing/zarinpal/callback'), sentRequest.callback_url);

  const before = await balance();
  const forged = await callback(authority1, 'OK');
  await sleep(100);
  check('a forged success callback changes nothing', forged.includes('payment=pending') && (await orgState()).plan === 'FREE' && (await balance()) === before, { forged, org: await orgState() });
  check('an unknown authority fails safely', (await callback('NOPE123', 'OK')).includes('payment=failed'));
  check('a malformed authority fails safely', (await callback('%27%3B--', 'OK')).includes('payment=failed'));

  gateway.paid.add(authority1);
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => callback(authority1, 'OK')));
  check('a verified payment reports success', results.every((r) => r.includes('payment=paid') && r.includes('ref=')), results);
  const after1 = await orgState();
  check('the plan activates after verification', after1.plan === 'STARTER' && after1.subscription_status === 'active' && new Date(after1.end).getTime() > Date.now() + 27 * 86400000, after1);
  const grants = await owner.query(`SELECT count(*)::int AS n, COALESCE(sum(amount), 0)::int AS total FROM credit_transactions WHERE organization_id = $1 AND reference_type = 'payment'`, [orgE]);
  check('concurrent callbacks grant credits once', grants.rows[0].n === 1 && (await balance()) === before + grants.rows[0].total, grants.rows[0]);
  check('a replayed callback changes nothing', (await callback(authority1, 'OK')).includes('payment=paid') && (await owner.query(`SELECT count(*)::int AS n FROM credit_transactions WHERE organization_id = $1 AND reference_type = 'payment'`, [orgE])).rows[0].n === 1);
  const ledger = await owner.query(`SELECT w.balance, w.total_granted, w.total_consumed, (SELECT COALESCE(SUM(amount), 0)::int FROM credit_transactions t WHERE t.organization_id = w.organization_id) AS sum FROM credit_wallets w WHERE organization_id = $1`, [orgE]);
  check('wallet matches its ledger after payment', ledger.rows[0].balance === ledger.rows[0].total_granted - ledger.rows[0].total_consumed, ledger.rows[0]);
  const history = await pay('GET', '/billing/payments', tokenE);
  check('payment history shows the receipt', history.data?.[0]?.status === 'paid' && !!history.data[0].refId, history.data?.[0]);
  check('another tenant sees no payments of this one', (await pay('GET', '/billing/payments', TB)).data?.every((x: any) => x.id !== history.data[0].id));

  const canceled = await pay('POST', '/billing/checkout', tokenE, { planId: 'STARTER', interval: 'month' });
  check('a cancelled payment fails and changes nothing', (await callback(canceled.data.url.split('/').pop(), 'NOK')).includes('payment=failed') && (await orgState()).plan === 'STARTER');

  const endBeforeRenew = new Date((await orgState()).end).getTime();
  const renew = await pay('POST', '/billing/checkout', tokenE, { planId: 'STARTER', interval: 'month' });
  gateway.paid.add(renew.data.url.split('/').pop());
  await callback(renew.data.url.split('/').pop(), 'OK');
  check('early renewal adds to the time already paid', new Date((await orgState()).end).getTime() > endBeforeRenew + 27 * 86400000);
  check('a downgrade waits for the period to end', (await pay('POST', '/billing/checkout', tokenE, { planId: 'STARTER', interval: 'month' })).status === 200 && (await owner.query(`UPDATE organizations SET plan = 'PRO' WHERE id = $1`, [orgE]), (await pay('POST', '/billing/checkout', tokenE, { planId: 'STARTER', interval: 'month' })).status === 409));
  await owner.query(`UPDATE organizations SET plan = 'STARTER' WHERE id = $1`, [orgE]);

  const upgradeQuote = await pay('GET', '/billing/quote?planId=PRO&interval=month', tokenE);
  check('an upgrade is discounted by unused time', upgradeQuote.data?.credit > 0 && upgradeQuote.data?.amount === pro.priceMonthlyToman - upgradeQuote.data.credit, upgradeQuote.data);
  const upgrade = await pay('POST', '/billing/checkout', tokenE, { planId: 'PRO', interval: 'month' });
  check('the upgrade charges the discounted amount', gateway.requests.at(-1).amount === upgrade.data?.amount && upgrade.data.amount < pro.priceMonthlyToman, upgrade.json);
  const closedBrowser = upgrade.data.url.split('/').pop();
  gateway.paid.add(closedBrowser);
  check('a customer who closed the browser is still activated', await waitFor(async () => (await orgState()).plan === 'PRO', 15000), await orgState());

  gateway.down = true;
  check('a gateway outage is reported, not hidden', (await pay('POST', '/billing/checkout', tokenE, { planId: 'AGENCY', interval: 'month' })).code === 'SERVICE_UNAVAILABLE');
  gateway.down = false;

  smtp.mails.length = 0;
  await owner.query(`UPDATE organizations SET subscription_current_period_end = NOW() + INTERVAL '2 days', renewal_reminder_sent_at = NULL WHERE id = $1`, [orgE]);
  check('a renewal reminder is emailed before the period ends', await waitFor(async () => smtp.mails.some((m) => m.to === `erin-${tag}@example.test`), 8000));
  await sleep(1500);
  check('the reminder is sent only once', smtp.mails.filter((m) => m.to === `erin-${tag}@example.test`).length === 1, smtp.mails.length);
  await owner.query(`UPDATE organizations SET subscription_current_period_end = NOW() - INTERVAL '1 day' WHERE id = $1`, [orgE]);
  check('an ended period enters the grace time and keeps the plan', await waitFor(async () => (await orgState()).subscription_status === 'past_due', 5000) && (await orgState()).plan === 'PRO', await orgState());
  await owner.query(`UPDATE organizations SET subscription_current_period_end = NOW() - INTERVAL '4 days' WHERE id = $1`, [orgE]);
  check('after the grace time the plan returns to FREE', await waitFor(async () => (await orgState()).plan === 'FREE', 5000), await orgState());
  check('expired customers keep their credits and data', (await pay('GET', '/projects', tokenE)).status === 200 && (await balance()) > 0);
  const stripeLike = await owner.query(`UPDATE organizations SET plan = 'PRO', stripe_subscription_id = 'sub_x', subscription_status = 'active', subscription_current_period_end = NOW() - INTERVAL '10 days' WHERE id = $1 RETURNING id`, [orgE]);
  await sleep(1200);
  check('self-renewing subscriptions are not expired by this job', stripeLike.rows.length === 1 && (await orgState()).plan === 'PRO');

  check('a customer cannot set plan prices', (await call('PATCH', '/platform/plans/PRO', T, { priceMonthlyToman: 1, priceAnnualToman: 1 })).status === 404);
  const priced = await call('PATCH', '/platform/plans/STARTER', TR, { priceMonthlyToman: starter.priceMonthlyToman + 1000, priceAnnualToman: starter.priceAnnualToman });
  check('operator can change a plan price', priced.status === 200 && (await pay('GET', '/billing/plans')).data.find((p: any) => p.id === 'STARTER').priceMonthlyToman === starter.priceMonthlyToman + 1000, priced.json);
  await call('PATCH', '/platform/plans/STARTER', TR, { priceMonthlyToman: starter.priceMonthlyToman, priceAnnualToman: starter.priceAnnualToman });
  check('operator sees toman revenue', (await call('GET', '/platform/overview', TR)).data?.revenue_toman_month > 0);

  console.log('--- Data sources that need no foreign provider');
  const noProviderApi = PROD_PORT; // Runs without DataForSEO credentials.
  await owner.query(`UPDATE users SET email_verified = true`);
  const relogin = async (port: number) => (await call('POST', '/auth/login', null, { email: `alice-${tag}@example.test`, password }, { port, headers: { 'x-forwarded-proto': 'https', 'x-forwarded-for': '198.51.100.77' } })).data?.token as string;
  const tokenP = await relogin(noProviderApi);
  const prodHeaders = { port: noProviderApi, headers: { 'x-forwarded-proto': 'https', 'x-forwarded-for': '198.51.100.77' } };
  const rk = await call('GET', `/projects/${pid}/rankings`, tokenP, undefined, prodHeaders);
  check('ranks can be read with no provider configured', rk.status === 200 && rk.json.provider?.status === 'not_configured', rk.json);
  check('backlinks can be read with no provider configured', (await call('GET', `/projects/${pid}/backlinks`, tokenP, undefined, prodHeaders)).status === 200);
  check('a live rank check still says it has no provider', (await call('POST', `/projects/${pid}/rankings/check`, tokenP, {}, prodHeaders)).code === 'PROVIDER_NOT_CONFIGURED');
  await owner.query(`UPDATE organizations SET plan = 'FREE' WHERE id = $1`, [orgId]);
  const planKeywords = (await owner.query(`SELECT count(*)::int AS n FROM keywords WHERE organization_id = $1`, [orgId])).rows[0].n;
  const imported = await call('POST', `/projects/${pid}/rankings/import`, tokenP, {
    rows: [{ query: 'Mock Keyword', position: 4.6, clicks: 3, impressions: 40 }, { query: 'واژهٔ تازه', position: 12 }, ...Array.from({ length: 30 }, (_, i) => ({ query: `extra ${i}`, position: 50 }))],
  }, prodHeaders);
  check('import updates tracked keywords and adds new ones up to the plan limit', imported.status === 201 && imported.data.matched === 1 && imported.data.created === 10 - planKeywords && imported.data.skipped > 0, imported.json);
  const tracked = (await owner.query(`SELECT current_position FROM keywords WHERE organization_id = $1 AND normalized_keyword = 'mock keyword'`, [orgId])).rows[0];
  check('imported position is rounded and stored', tracked.current_position === 5, tracked);
  check('re-importing does not duplicate rank history', (await call('POST', `/projects/${pid}/rankings/import`, tokenP, { rows: [{ query: 'mock keyword', position: 3 }] }, prodHeaders)).status === 201 && (await owner.query(`SELECT count(*)::int AS n FROM keyword_rankings r JOIN keywords k ON k.id = r.keyword_id WHERE r.date = CURRENT_DATE AND k.normalized_keyword = 'mock keyword' AND k.organization_id = $1`, [orgId])).rows[0].n === 1);
  check('import rejects a bad position', (await call('POST', `/projects/${pid}/rankings/import`, tokenP, { rows: [{ query: 'x', position: -1 }] }, prodHeaders)).status === 400);
  check('import rejects too many rows', (await call('POST', `/projects/${pid}/rankings/import`, tokenP, { rows: Array.from({ length: 5001 }, (_, i) => ({ query: `q${i}`, position: 1 })) }, prodHeaders)).status === 400);
  check('import cannot write to another tenant', (await call('POST', `/projects/${pidb}/rankings/import`, tokenP, { rows: [{ query: 'x', position: 1 }] }, prodHeaders)).status === 404);
  const linksImport = await call('POST', `/projects/${pid}/backlinks/import`, tokenP, { rows: [{ sourceUrl: 'https://ref.ir/a', anchor: 'لینک', domainRating: 30, nofollow: true }, { sourceUrl: 'https://other.ir' }] }, prodHeaders);
  check('backlinks are imported', linksImport.data?.inserted === 2, linksImport.json);
  check('re-importing backlinks refreshes them', (await call('POST', `/projects/${pid}/backlinks/import`, tokenP, { rows: [{ sourceUrl: 'https://other.ir' }] }, prodHeaders)).data?.refreshed === 1);
  check('a non-web address is rejected', (await call('POST', `/projects/${pid}/backlinks/import`, tokenP, { rows: [{ sourceUrl: 'javascript:alert(1)' }] }, prodHeaders)).status === 400);

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
  gatewayServer.close();
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
