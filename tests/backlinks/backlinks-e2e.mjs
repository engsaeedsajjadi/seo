// Backlink discovery through the real API and worker against fake-graph.mjs. Phase "a" or "b".
import { readFileSync, writeFileSync } from 'node:fs';
const [phase, ctxFile] = [process.argv[2], process.argv[3]];
const base = 'http://127.0.0.1:3001/api/v1';
let passed = 0, failed = 0;
const check = (n, ok, d) => { if (ok) { passed++; console.log('PASS', n); } else { failed++; console.log('FAIL', n, d === undefined ? '' : JSON.stringify(d).slice(0, 400)); } };
let T;
const call = async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', origin: 'http://localhost:4173', ...(T ? { authorization: `Bearer ${T}` } : {}) }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json().catch(() => null); return { status: r.status, data: j?.data, code: j?.error?.code }; };
const ctx = JSON.parse(readFileSync(ctxFile, 'utf8'));
T = ctx.token;
const pid = ctx.pid;
const run = async () => {
  const q = await call('POST', `/projects/${pid}/backlinks/discover`, {});
  let job;
  for (let i = 0; i < 80; i++) { job = ((await call('GET', `/jobs?projectId=${pid}`)).data ?? []).find((j) => j.id === q.data?.job?.id); if (['completed', 'failed', 'dead_letter'].includes(job?.status)) break; await new Promise((r) => setTimeout(r, 500)); }
  return { q, job };
};
if (phase === 'a') {
  const { q, job } = await run();
  check('discovery is queued', q.status === 201, q);
  check('the worker reads the graph', job?.status === 'completed' && job.result?.release === 'cc-main-test-a' && job.result?.targets === 2, job);
  const again = await call('POST', `/projects/${pid}/backlinks/discover`, {});
  const ref = (await call('GET', `/projects/${pid}/backlinks/referring-domains`)).data;
  check('referring domains of the project', ref?.active === 2 && ref.domains.map((d) => d.domain).join() === 'blog-example.com,wiki-example.org' && ref.release === 'cc-main-test-a', ref);
  const prospects = (await call('GET', `/projects/${pid}/backlinks/prospects`)).data ?? [];
  check('a domain linking only to the competitor is a prospect', prospects.length === 1 && prospects[0].domain === 'news-example.ir' && prospects[0].competitorCount === 1, prospects);
  const patched = await call('PATCH', `/projects/${pid}/backlinks/prospects/${prospects[0]?.id}`, { status: 'contacted', note: 'ایمیل فرستاده شد' });
  check('outreach status and note are saved', patched.data?.status === 'contacted' && patched.data?.note === 'ایمیل فرستاده شد', patched);
  check('a bad status is refused', (await call('PATCH', `/projects/${pid}/backlinks/prospects/${prospects[0]?.id}`, { status: 'paid' })).status === 400);
  writeFileSync(ctxFile, JSON.stringify({ ...ctx, again: again.status }));
} else {
  const { job } = await run();
  check('a newer release is read', job?.status === 'completed' && job.result?.release === 'cc-main-test-b', job);
  const ref = (await call('GET', `/projects/${pid}/backlinks/referring-domains`)).data;
  const status = Object.fromEntries((ref?.domains ?? []).map((d) => [d.domain, d.status]));
  check('a link missing from the new release is marked lost', status['blog-example.com'] === 'lost' && status['wiki-example.org'] === 'active' && ref.lost === 1, ref);
  const prospects = (await call('GET', `/projects/${pid}/backlinks/prospects`)).data ?? [];
  check('outreach progress survives a new release', prospects.find((p) => p.domain === 'news-example.ir')?.status === 'contacted', prospects);
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
