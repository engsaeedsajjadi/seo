/**
 * RankForge — Golden-Path E2E (CI job: e2e-golden-path)
 *
 * Exercises the exact first-run path a new customer takes, against the
 * REAL stack (API + worker + PostgreSQL), with no public internet:
 *
 *   signup → login → wallet funded → create project → POST crawl →
 *   worker completes the crawl of a local fixture site → audit findings
 *   persisted → SEO score computed → credits deducted.
 *
 * The crawl target is the checked-in fixture site (tests/fixtures/site),
 * served by this script over HTTPS on FIXTURE_HOST:FIXTURE_PORT with a
 * self-signed certificate generated on the fly. The fixture pages carry
 * known, deliberate SEO defects (contact.html has no <title>, index.html
 * has images without alt text, about/products/contact have no canonical),
 * so the expected finding rule ids are known in advance.
 *
 * Prerequisites (the CI job performs exactly these steps):
 *   1. PostgreSQL up; `npm run db:migrate` + `npm run db:seed` done.
 *   2. API running (API_URL, default http://localhost:3001).
 *   3. Worker running with NODE_TLS_REJECT_UNAUTHORIZED=0 — TEST ONLY:
 *      the fixture uses a self-signed cert; never set this in production.
 *      In proxied environments the worker must also bypass the proxy for
 *      the fixture host (NO_PROXY must include FIXTURE_HOST), or the
 *      crawl goes to the egress proxy instead of the fixture server.
 *   4. FIXTURE_HOST resolves to 127.0.0.1 (an /etc/hosts entry), e.g.:
 *        echo "127.0.0.1 fixture.rankforge.test" | sudo tee -a /etc/hosts
 *      The worker's SSRF guard passes the hostname (it is not a blocked
 *      name), and /etc/hosts makes the fetch land on this script's server.
 *
 * Exit code 0 = golden path verified. Any failed assertion exits 1 with
 * the step that failed.
 */

import assert from 'assert';
import { execFileSync } from 'child_process';
import { lookup } from 'dns/promises';
import fs from 'fs';
import https from 'https';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'tests', 'fixtures', 'site');

const API_URL = process.env.API_URL || 'http://localhost:3001';
const FIXTURE_HOST = process.env.FIXTURE_HOST || 'fixture.rankforge.test';
const FIXTURE_PORT = parseInt(process.env.FIXTURE_PORT || '8443', 10);
const POLL_TIMEOUT_MS = parseInt(process.env.E2E_POLL_TIMEOUT_MS || '180000', 10);

// Finding rules the fixture defects guarantee (see file header):
//  - contact.html: no <title> at all            → missing_title
//  - index.html: <img> with empty/missing alt   → images_without_alt
//  - about/products/contact: no canonical link  → missing_canonical
const EXPECTED_RULES = ['missing_title', 'images_without_alt', 'missing_canonical'];

function step(msg: string) {
  console.log(`\n▶ ${msg}`);
}
function ok(msg: string) {
  console.log(`  ✅ ${msg}`);
}
function check(cond: any, msg: string): asserts cond {
  assert.ok(cond, msg);
  ok(msg);
}

async function api(method: string, p: string, token?: string, body?: any) {
  const res = await fetch(`${API_URL}${p}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('🧪 RankForge Golden-Path E2E');
  console.log(`API_URL=${API_URL} FIXTURE=https://${FIXTURE_HOST}:${FIXTURE_PORT}`);

  // --- 0. Fixture host must resolve to loopback (via /etc/hosts) --------
  step('0. Fixture host DNS probe');
  const probe = await lookup(FIXTURE_HOST, { all: true }).catch(() => []);
  check(
    probe.some(r => r.address === '127.0.0.1' || r.address === '::1'),
    `${FIXTURE_HOST} resolves to loopback (${probe.map(r => r.address).join(', ') || 'no result'}) — if empty, add "127.0.0.1 ${FIXTURE_HOST}" to /etc/hosts`,
  );

  // --- 1. Self-signed cert + fixture HTTPS server -----------------------
  step('1. Serve fixture site over HTTPS (self-signed cert)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rankforge-e2e-'));
  const keyPath = path.join(tmp, 'key.pem');
  const certPath = path.join(tmp, 'cert.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-keyout', keyPath, '-out', certPath,
    '-days', '2', '-nodes', '-subj', `/CN=${FIXTURE_HOST}`,
    '-addext', `subjectAltName=DNS:${FIXTURE_HOST}`,
  ], { stdio: 'pipe' });

  const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
  };
  const server = https.createServer(
    { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) },
    (req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
      const filePath = path.join(FIXTURE_DIR, rel);
      if (!filePath.startsWith(FIXTURE_DIR) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><head><title>404</title></head><body>Not Found</body></html>');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(fs.readFileSync(filePath));
    },
  );
  await new Promise<void>(resolve => server.listen(FIXTURE_PORT, resolve));
  ok(`Fixture live at https://${FIXTURE_HOST}:${FIXTURE_PORT}/`);

  try {
    // --- 2. API health ----------------------------------------------------
    step('2. API health');
    let healthy = false;
    for (let i = 0; i < 20 && !healthy; i++) {
      try {
        const res = await fetch(`${API_URL}/api/v1/health`, { signal: AbortSignal.timeout(5000) });
        healthy = res.status === 200;
      } catch { /* retry */ }
      if (!healthy) await sleep(3000);
    }
    check(healthy, 'API /api/v1/health returns 200');

    // --- 3. Signup + login -------------------------------------------------
    step('3. Signup → login');
    const email = `e2e-golden-${Date.now()}@example.test`;
    const password = 'E2eGoldenPath123!';
    const signup = await api('POST', '/api/v1/auth/signup', undefined, { email, password, name: 'E2E Golden Path' });
    check(signup.status === 201 && signup.json.success, `signup 201 (got ${signup.status})`);
    const login = await api('POST', '/api/v1/auth/login', undefined, { email, password });
    check(login.status === 200 && login.json.data?.token, 'login 200 with token');
    const token: string = login.json.data.token;

    // --- 4. Wallet starts funded -------------------------------------------
    step('4. Wallet baseline');
    const wallet0 = await api('GET', '/api/v1/billing/credits', token);
    const balance0: number = wallet0.json.data?.balance;
    check(typeof balance0 === 'number' && balance0 >= 10, `new org wallet funded (balance=${balance0})`);

    // --- 5. Create project for the fixture domain --------------------------
    step('5. Create project');
    const domain = `${FIXTURE_HOST}:${FIXTURE_PORT}`;
    const project = await api('POST', '/api/v1/projects', token, { name: 'E2E Fixture Project', domain });
    check(project.status === 201 && project.json.data?.id, `project created (status ${project.status})`);
    const projectId: string = project.json.data.id;

    // --- 6. Start a crawl ---------------------------------------------------
    step('6. Start crawl (POST /projects/:id/crawl)');
    const crawl = await api('POST', `/api/v1/projects/${projectId}/crawl`, token, { maxPages: 20, maxDepth: 3 });
    check(crawl.status === 201 && crawl.json.data?.crawlRun?.id, `crawl accepted (status ${crawl.status})`);
    const crawlRunId: string = crawl.json.data.crawlRun.id;

    // --- 7. Wait for the worker to complete it ------------------------------
    step('7. Poll crawl run until completed');
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let runStatus = '';
    while (Date.now() < deadline) {
      const crawls = await api('GET', `/api/v1/projects/${projectId}/crawls`, token);
      const run = (crawls.json.data || []).find((r: any) => r.id === crawlRunId);
      runStatus = run?.status || '';
      if (runStatus === 'completed') break;
      check(runStatus !== 'failed', 'crawl run must not fail');
      await sleep(3000);
    }
    check(runStatus === 'completed', `crawl run completed (final status: ${runStatus || 'timeout'})`);

    // --- 8. Findings ---------------------------------------------------------
    step('8. Audit findings persisted');
    const findings = await api('GET', `/api/v1/projects/${projectId}/audit/findings?limit=100`, token);
    const items: any[] = findings.json.data || [];
    const ruleIds = new Set(items.map((f: any) => f.ruleId));
    check(items.length >= 4, `findings present (${items.length} findings)`);
    for (const rule of EXPECTED_RULES) {
      check(ruleIds.has(rule), `expected finding rule present: ${rule}`);
    }
    console.log(`     rules: ${[...ruleIds].join(', ')}`);

    // --- 9. SEO score ---------------------------------------------------------
    step('9. SEO score computed');
    const proj = await api('GET', `/api/v1/projects/${projectId}`, token);
    const score = proj.json.data?.seoScore;
    check(typeof score === 'number' && score >= 0 && score <= 100, `project seoScore is a number in [0,100] (got ${score})`);

    // --- 10. Credits deducted --------------------------------------------------
    step('10. Credits deducted for crawl job(s)');
    let balance1 = balance0;
    const balDeadline = Date.now() + 60000;
    while (Date.now() < balDeadline) {
      const w = await api('GET', '/api/v1/billing/credits', token);
      balance1 = w.json.data?.balance;
      if (typeof balance1 === 'number' && balance1 < balance0) break;
      await sleep(3000);
    }
    check(balance1 < balance0, `wallet decreased (${balance0} → ${balance1})`);
    check((balance0 - balance1) % 5 === 0, `deduction is a multiple of the 5-credit crawl cost (${balance0 - balance1})`);

    step('11. Generate, persist and download a report');
    const report=await api('POST',`/api/v1/projects/${projectId}/reports`,token,{type:'seo',format:'json'});
    check(report.status===201 && report.json.data?.report?.id,'report queued with persisted id');
    const reportId=report.json.data.report.id;
    const reportDeadline=Date.now()+POLL_TIMEOUT_MS;
    let ready=false;
    while(Date.now()<reportDeadline){
      const listed=await api('GET',`/api/v1/projects/${projectId}/reports`,token);
      const row=(listed.json.data || []).find((r:any)=>r.id===reportId);
      check(row?.status!=='failed','report must not fail');
      if(row?.status==='completed'){ready=true;break;}
      await sleep(2000);
    }
    check(ready,'worker completed the report');
    const downloaded=await api('GET',`/api/v1/projects/${projectId}/reports/${reportId}/download`,token);
    check(downloaded.status===200 && downloaded.json.project?.id===projectId,'download contains actual project snapshot');
    check(Array.isArray(downloaded.json.findings) && downloaded.json.findings.length>=4,'report contains persisted audit findings');

    console.log('\n✅ GOLDEN PATH PASSED: signup → login → project → crawl → findings + score → credits → report download');
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

await main().catch(e => {
  console.error(`\n❌ GOLDEN PATH FAILED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
