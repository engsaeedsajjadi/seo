/**
 * Private mode (SEOYAR_MODE=private) over HTTP with a real API and a fresh PostgreSQL database:
 * no billing, the first account becomes the owner, everyone else joins by invitation, and the
 * PRIVATE plan has no commercial limits.
 * Requires WORKER_TEST_DATABASE_URL (a superuser URL on a test cluster); creates and drops its own database.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { startSmtpStub } from '../helpers/smtp-stub.js';

const ADMIN_URL = process.env.WORKER_TEST_DATABASE_URL;
if (!ADMIN_URL) { console.log('SKIP: WORKER_TEST_DATABASE_URL not set'); process.exit(0); }
if (!new URL(ADMIN_URL).pathname.includes('test')) throw new Error('Refusing to run: database name must contain "test"');

const tag = randomBytes(4).toString('hex');
const dbName = `rankforge_private_test_${tag}`;
const admin = new Pool({ connectionString: ADMIN_URL, max: 2 });
await admin.query(`CREATE DATABASE ${dbName}`);
const dbUrl = new URL(ADMIN_URL); dbUrl.pathname = `/${dbName}`;
const OWNER_URL = dbUrl.toString();
const secret = randomBytes(32).toString('hex');
const ORIGIN = 'https://seoyar.private.test';
const PORT = 4300 + Math.floor(Math.random() * 50);
const SMTP_PORT = PORT + 60;
const smtp = startSmtpStub(SMTP_PORT);
const env = { PATH: process.env.PATH, NODE_ENV: 'test', JWT_SECRET: secret, ENCRYPTION_KEY: secret, DATABASE_URL: OWNER_URL, APP_URL: ORIGIN, CORS_ORIGINS: ORIGIN, SEOYAR_MODE: 'private' };

for (const step of ['src/db/migrate.ts', 'src/db/seed.ts']) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', step], { cwd: 'apps/api', env: env as any, encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stdout, r.stderr); throw new Error(`${step} failed`); }
}
const db = new Pool({ connectionString: OWNER_URL, max: 2 });
// The seed adds a demo account outside production; a real private install starts with no users.
await db.query(`DELETE FROM organizations WHERE slug = 'test-org'`);
await db.query(`DELETE FROM users WHERE email = 'test@rankforge.io'`);
const rolePass = randomBytes(12).toString('hex');
const apiRole = `rf_private_api_${tag}`;
const systemRole = `rf_private_sys_${tag}`;
await db.query(`CREATE ROLE ${apiRole} LOGIN PASSWORD '${rolePass}' NOSUPERUSER NOBYPASSRLS IN ROLE rankforge_api`);
await db.query(`CREATE ROLE ${systemRole} LOGIN PASSWORD '${rolePass}' NOSUPERUSER BYPASSRLS IN ROLE rankforge_api_system`);
const asRole = (name: string) => { const u = new URL(OWNER_URL); u.username = name; u.password = rolePass; return u.toString(); };

const procs: ChildProcess[] = [];
procs.push(spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
  cwd: 'apps/api', stdio: 'ignore',
  env: { ...env, PORT: String(PORT), DATABASE_URL: asRole(systemRole), APP_DATABASE_URL: asRole(apiRole),
    SMTP_URL: `smtp://127.0.0.1:${SMTP_PORT}`, MAIL_FROM: 'noreply@seoyar.test', REQUIRE_EMAIL_VERIFICATION: 'false' } as any,
}));

/** Text of a captured message: the body after the headers, base64-decoded when sent that way. */
function mailBody(raw: string): string {
  const [head, ...rest] = raw.split('\r\n\r\n');
  const body = rest.join('\r\n\r\n').replace(/\r\n\.\r\n$/, '');
  return /base64/i.test(head) ? Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8') : body;
}

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) { passed++; console.log(`PASS ${name}`); } else { failures.push(name); console.log(`FAIL ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 300)); }
};
const base = `http://127.0.0.1:${PORT}/api/v1`;
async function call(method: string, path: string, token?: string, body?: unknown) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', origin: ORIGIN, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j: any = await r.json().catch(() => null);
  return { status: r.status, data: j?.data, error: j?.error };
}

try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/config`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); }

  let cfg = await call('GET', '/config');
  check('a fresh private install offers sign-up only for the owner', cfg.data?.mode === 'private' && cfg.data?.billing === false && cfg.data?.signup === 'first-user', cfg.data);

  const owner = await call('POST', '/auth/signup', undefined, { email: `owner-${tag}@example.test`, password: 'Str0ng!Passw0rd#22', name: 'Owner' });
  check('the first person signs up and owns the organization', owner.status === 201 && owner.data?.organization?.plan === 'PRIVATE', owner);
  const T = owner.data?.token as string;

  cfg = await call('GET', '/config');
  check('after the owner, sign-up is by invitation only', cfg.data?.signup === 'invite-only', cfg.data);
  const stranger = await call('POST', '/auth/signup', undefined, { email: `x-${tag}@example.test`, password: 'Str0ng!Passw0rd#22', name: 'X' });
  check('a stranger cannot sign up', stranger.status === 403 && stranger.error?.code === 'SIGNUP_CLOSED', stranger);

  for (const path of ['/billing/plans', '/billing/subscription', '/billing/credits']) {
    const r = await call('GET', path, T);
    check(`billing is not available: ${path}`, r.status === 404, r.status);
  }
  const checkout = await call('POST', '/billing/checkout', T, { planId: 'PRO', interval: 'month' });
  check('checkout is not available', checkout.status === 404, checkout.status);

  // No commercial limits: FREE allowed 1 project and 10 keywords.
  const projects: string[] = [];
  for (let i = 0; i < 3; i++) {
    const p = await call('POST', '/projects', T, { name: `P${i}`, domain: `site${i}-${tag}.rankforge.test`, country: 'IR', language: 'fa' });
    if (p.data?.id) projects.push(p.data.id);
  }
  check('more projects than any small plan allowed', projects.length === 3, projects.length);
  const kw = await call('POST', `/projects/${projects[0]}/keywords`, T, { keywords: Array.from({ length: 15 }, (_, i) => `کلمه ${i}`) });
  check('more keywords than the free plan allowed', kw.status === 201 || kw.status === 200, kw);

  // Crawls are not charged to a wallet: empty it and a crawl is still accepted.
  await db.query(`UPDATE credit_wallets SET balance = 0`);
  // A new project queues its first crawl; finish those so a new crawl can start.
  await db.query(`UPDATE jobs SET status = 'cancelled' WHERE type = 'SITE_CRAWL' AND status IN ('pending', 'running')`);
  const crawl = await call('POST', `/projects/${projects[0]}/crawl`, T, { maxPages: 5 });
  check('a crawl needs no credits', crawl.status === 201 || crawl.status === 202 || crawl.status === 200, crawl);
  // The Worker charges through rf_worker_charge_job; a PRIVATE organization is never charged.
  const running = await db.query(`UPDATE jobs SET status = 'running', execution_id = gen_random_uuid()
    WHERE type = 'SITE_CRAWL' AND status = 'pending' AND project_id = $1 RETURNING id, execution_id`, [projects[0]]);
  const charge = running.rows[0] ? await db.query('SELECT rf_worker_charge_job($1, $2) AS outcome', [running.rows[0].id, running.rows[0].execution_id]) : null;
  const wallet = await db.query('SELECT balance FROM credit_wallets');
  check('the worker does not charge a private crawl', charge?.rows[0]?.outcome === 'not_billable' && wallet.rows.every((w) => Number(w.balance) === 0), { outcome: charge?.rows[0]?.outcome });

  // Invitations.
  const email = `staff-${tag}@example.test`;
  const invite = await call('POST', '/organizations/current/members', T, { email, role: 'SEO_Manager' });
  check('inviting a person without an account returns a link', invite.status === 201 && invite.data?.invited === true && /#\/invite\/[A-Za-z0-9_-]{20,}$/.test(invite.data?.inviteUrl ?? ''), invite);
  check('the link starts with the app address', String(invite.data?.inviteUrl).startsWith(`${ORIGIN}/#/invite/`));
  await new Promise((r) => setTimeout(r, 500));
  const mail = smtp.mails.find((m) => m.to === email);
  check('the invitation is emailed', invite.data?.emailed === true && !!mail && mailBody(mail.raw).includes(invite.data.inviteUrl), { emailed: invite.data?.emailed, mails: smtp.mails.length });
  const token = String(invite.data?.inviteUrl).split('/invite/')[1];

  const listed = await call('GET', '/organizations/current/invitations', T);
  check('the owner sees the pending invitation', listed.data?.length === 1 && listed.data[0].email === email && listed.data[0].role === 'SEO_Manager', listed.data);
  const described = await call('GET', `/auth/invitations/${token}`);
  check('the invitation page shows organization and role, not the token', described.data?.email === email && described.data?.role === 'SEO_Manager' && !!described.data?.organizationName && !('token' in (described.data ?? {})), described.data);

  const bad = await call('POST', '/auth/signup', undefined, { inviteToken: 'x'.repeat(40), password: 'Str0ng!Passw0rd#22', name: 'Bad' });
  check('a wrong invitation token is refused', bad.status === 404, bad);
  const joined = await call('POST', '/auth/signup', undefined, { inviteToken: token, password: 'Str0ng!Passw0rd#22', name: 'Staff', email: 'other@example.test' });
  check('the invited person creates an account with the invited email', joined.status === 201 && joined.data?.user?.email === email, joined);
  check('the account joins the owner organization, not a new one', joined.data?.organization?.id === owner.data?.organization?.id);
  const S = joined.data?.token as string;
  const me = await call('GET', '/auth/me', S);
  check('the new member has the invited role and is verified', me.data?.user?.role === 'SEO_Manager' && me.data?.user?.emailVerified === true && me.data?.organizations?.length === 1, me.data);
  const sees = await call('GET', '/projects', S);
  const seen = Array.isArray(sees.data) ? sees.data : sees.data?.items ?? sees.data?.projects ?? [];
  check('the new member sees the organization projects', seen.length === 3, sees.data);
  const again = await call('POST', '/auth/signup', undefined, { inviteToken: token, password: 'Str0ng!Passw0rd#22', name: 'Again' });
  check('an invitation works only once', again.status === 404, again.status);

  const staffInvite = await call('POST', '/organizations/current/members', S, { email: `y-${tag}@example.test`, role: 'Viewer' });
  check('a non-admin member cannot invite', staffInvite.status === 403, staffInvite.status);
  const second = await call('POST', '/organizations/current/members', T, { email: `z-${tag}@example.test`, role: 'Viewer' });
  const revoked = await call('DELETE', `/organizations/current/invitations/${second.data?.id}`, T);
  const secondToken = String(second.data?.inviteUrl).split('/invite/')[1];
  check('a revoked invitation cannot be used', revoked.status === 200 && (await call('GET', `/auth/invitations/${secondToken}`)).status === 404);
  const adminInvite = await call('POST', '/organizations/current/members', S, { email: `w-${tag}@example.test`, role: 'Admin' });
  check('only the owner can invite an admin', adminInvite.status === 403, adminInvite.status);
} finally {
  procs.forEach((p) => p.kill());
  smtp.server.close();
  await db.end();
  await new Promise((r) => setTimeout(r, 500));
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => {});
  for (const role of [`rf_private_api_${tag}`, `rf_private_sys_${tag}`]) await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => {});
  await admin.end();
}
console.log(`\nRESULT: ${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
