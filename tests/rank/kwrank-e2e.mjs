// Rank check through the real API and worker with only KWRank configured (fake-kwrank.mjs on :5998).
const base = 'http://127.0.0.1:3001/api/v1';
const tag = Date.now().toString(36);
let passed = 0, failed = 0;
const check = (n, ok, d) => { if (ok) { passed++; console.log('PASS', n); } else { failed++; console.log('FAIL', n, d === undefined ? '' : JSON.stringify(d).slice(0, 400)); } };
let T;
const call = async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', origin: 'http://localhost:4173', ...(T ? { authorization: `Bearer ${T}` } : {}) }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json().catch(() => null); return { status: r.status, data: j?.data, j }; };
const runCheck = async (pid) => {
  const q = await call('POST', `/projects/${pid}/rankings/check`, {});
  let job;
  for (let i = 0; i < 60; i++) { job = ((await call('GET', `/jobs?projectId=${pid}`)).data ?? []).find((j) => j.id === q.data?.job?.id); if (['completed', 'failed', 'dead_letter'].includes(job?.status)) break; await new Promise((r) => setTimeout(r, 500)); }
  return { q, job };
};
const email = `kw-${tag}@example.test`;
T = (await call('POST', '/auth/signup', { email, password: 'Str0ng!Passw0rd#22', name: 'kw' })).data.token;
const pid = (await call('POST', '/projects', { name: 'K', domain: 'kw-demo.rankforge.test', country: 'IR', language: 'fa' })).data.id;
await call('POST', `/projects/${pid}/keywords`, { keywords: ['تور کیش', 'هتل کیش'] });
check('KWRank shows as connected', (await call('GET', '/integrations/status')).data?.kwrank === 'connected');

let { q, job } = await runCheck(pid);
check('a rank check is accepted with only KWRank configured', q.status === 201, q.j);
check('first run registers the domain and keywords and waits', job?.status === 'completed' && job.result?.added === 2 && job.result?.waiting === 2, job?.result ?? job);
check('nothing is recorded before KWRank has checked', ((await call('GET', `/projects/${pid}/rankings`)).data ?? []).length === 0);

await fetch('http://127.0.0.1:5998/__check', { method: 'POST' });
({ job } = await runCheck(pid));
check('second run reads the positions', job?.status === 'completed' && job.result?.ranked === 1 && job.result?.notRanked === 1 && job.result?.added === 0, job?.result);
const ranks = (await call('GET', `/projects/${pid}/rankings`)).data ?? [];
const kish = ranks.find((r) => r.keyword === 'تور کیش');
const hotel = ranks.find((r) => r.keyword === 'هتل کیش');
check('the exact position is stored', kish?.position === 4 && kish?.url === 'https://www.kw-demo.rankforge.test/tours/kish', kish);
check('the source is KWRank', kish?.provider === 'kwrank', kish);
check('outside the top 100 has no position', hotel && hotel.position === null, hotel);

await call('POST', `/projects/${pid}/keywords`, { keywords: ['کیش ارزان'] });
({ job } = await runCheck(pid));
check('a new keyword is added without duplicating the others', job?.result?.added === 1 && job.result?.ranked === 1 && job.result?.waiting === 1, job?.result);

console.log(JSON.stringify({ email, pid }));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
