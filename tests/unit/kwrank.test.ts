/**
 * KWRank client with the HTTP layer replaced by responses shaped like the examples in
 * https://kwrank.ir/documentation/web-api/reference/. A real call needs KWRANK_CLIENT_ID/SECRET.
 */
import assert from 'assert';
import { KwRankClient, KwRankError, matchKwRankKeywords, normalizePersianKeyword, kwRankDevice } from '../../apps/worker/src/kwrank.js';

console.log('Testing KWRank client (HTTP replaced)...');

type Call = { method: string; url: URL; auth?: string; form: Record<string, string> };
const page = (key: string, data: any[], next: string | null = null) => ({ result: true, [key]: { current_page: 1, data, next_page_url: next }, status: 200 });

function fake(routes: (c: Call) => any, calls: Call[]) {
  return async (url: string, init: any) => {
    const form: Record<string, string> = {};
    if (init?.body) for (const [k, v] of (init.body as FormData).entries()) form[k] = String(v);
    const call = { method: init?.method ?? 'GET', url: new URL(url), auth: init?.headers?.Authorization, form };
    calls.push(call);
    const out = routes(call);
    const status = out?.__status ?? 200;
    return { ok: status < 400, status, text: async () => JSON.stringify(out) };
  };
}

const kw = (id: number, name: string, extra: any = {}) => ({
  id, device_type: 'desktop', is_active: 1, keyword_name: name, has_the_ranking_ever_been_checked: true,
  link: 'https://www.gardima.ir/kish', rank: 7, rank_changes: null, country: 'ایران', rank_updated_at: '2026-11-06', ...extra,
});

// Authorize once, find the domain across pages, read ranks.
{
  const calls: Call[] = [];
  const client = new KwRankClient('cid', 'csecret', 'https://kw.example/api/v1', fake((c) => {
    const p = c.url.pathname;
    if (p.endsWith('/authorize')) return { result: true, access_token: 'tok-1', token_type: 'Bearer', status: 200 };
    if (p.endsWith('/domains') && c.url.searchParams.get('page') === '1') return page('domains_list', [{ id: 10, is_active: 1, link: 'other.ir' }], 'next');
    if (p.endsWith('/domains')) return page('domains_list', [{ id: 56, is_active: 1, link: 'www.Gardima.ir' }]);
    if (p.endsWith('/domain/56/keywords')) return page('keywords_list', [kw(65, 'تور كيش'), kw(66, 'بلیط هواپیما', { rank: null, link: null }), kw(67, 'هتل', { has_the_ranking_ever_been_checked: false, rank: null })]);
    throw new Error('unexpected ' + p);
  }, calls));
  const domain = await client.ensureDomain('https://gardima.ir/');
  assert.deepStrictEqual(domain, { id: 56, created: false, active: true });
  const auth = calls.filter((c) => c.url.pathname.endsWith('/authorize'));
  assert.strictEqual(auth.length, 1);
  assert.deepStrictEqual(auth[0].form, { client_id: 'cid', secret_id: 'csecret' }, 'credentials go in the form body as documented');
  assert.strictEqual(calls[1].auth, 'Bearer tok-1');
  assert.strictEqual(calls[1].url.searchParams.get('link_type'), 'all');
  const list = await client.listKeywords(56);
  assert.strictEqual(list.length, 3);
  assert.strictEqual(list[0].rank, 7);
  assert.strictEqual(list[1].rank, null, 'null rank means not in the first 100');
  assert.strictEqual(list[2].checked, false);
  assert.strictEqual(calls.filter((c) => c.url.pathname.endsWith('/authorize')).length, 1, 'the token is reused');
}
console.log('✅ authorize once, domain found across pages, ranks parsed');

// A missing domain is added; keywords are added with country and device.
{
  const calls: Call[] = [];
  const client = new KwRankClient('cid', 's', undefined, fake((c) => {
    const p = c.url.pathname;
    if (p.endsWith('/authorize')) return { result: true, access_token: 't' };
    if (p.endsWith('/domains') && c.method === 'GET') return page('domains_list', []);
    if (p.endsWith('/domains') && c.method === 'POST') return { result: true, message: 'Domain added successfully.', status: 200, id: 90 };
    if (p.endsWith('/domain/90/keywords') && c.method === 'POST') return { result: true, keywords: Object.keys(c.form).filter((k) => k.startsWith('keywords[')).map((k, i) => ({ id: i, keyword_name: c.form[k] })), status: 200 };
    throw new Error('unexpected ' + p);
  }, calls));
  const d = await client.ensureDomain('www.gardima.ir');
  assert.deepStrictEqual(d, { id: 90, created: true, active: true });
  assert.strictEqual(calls.find((c) => c.method === 'POST' && c.url.pathname.endsWith('/domains'))!.form.domain, 'gardima.ir');
  assert.strictEqual(calls[0].url.origin, 'https://kwrank.ir');
  const added = await client.addKeywords(90, ['تور کیش', 'هتل کیش'], 1, 'android');
  assert.strictEqual(added, 2);
  const post = calls.find((c) => c.url.pathname.endsWith('/domain/90/keywords'))!;
  assert.deepStrictEqual(post.form, { 'keywords[0]': 'تور کیش', 'keywords[1]': 'هتل کیش', country_id: '1', device_type: 'android' });
}
console.log('✅ domain and keywords are registered with the documented fields');

// A refused token is renewed once; a refused account surfaces.
{
  let tokens = 0;
  const calls: Call[] = [];
  const client = new KwRankClient('cid', 's', undefined, fake((c) => {
    if (c.url.pathname.endsWith('/authorize')) return { result: true, access_token: `t${++tokens}` };
    if (c.auth === 'Bearer t1') return { __status: 401, result: false, message: 'Unauthenticated.' };
    return page('domains_list', [{ id: 1, is_active: 0, link: 'gardima.ir' }]);
  }, calls));
  assert.deepStrictEqual(await client.ensureDomain('gardima.ir'), { id: 1, created: false, active: false });
  assert.strictEqual(tokens, 2);
  const bad = new KwRankClient('x', 'y', undefined, fake(() => ({ __status: 401, result: false, message: 'Invalid client credentials' }), []));
  await assert.rejects(bad.ensureDomain('gardima.ir'), (e: unknown) => e instanceof KwRankError && e.httpStatus === 401 && /Invalid client/.test(e.message));
  const noPlan = new KwRankClient('x', 'y', undefined, fake((c) => c.url.pathname.endsWith('/authorize') ? { result: true, access_token: 't' } : { result: false, message: 'No active API plan', status: 403 }, []));
  await assert.rejects(noPlan.ensureDomain('gardima.ir'), (e: unknown) => e instanceof KwRankError && e.httpStatus === 403);
}
console.log('✅ expired token renewed; wrong credentials and inactive plan surface');

// Matching tolerates Arabic letters and half-spaces, and respects the device.
{
  assert.strictEqual(normalizePersianKeyword('تور  كيش'), 'تور کیش');
  assert.strictEqual(normalizePersianKeyword('لپ‌تاپ'), normalizePersianKeyword('لپ تاپ'));
  const remote = [
    { id: 1, keyword: 'تور كيش', device: 'desktop', active: true, checked: true, rank: 3, url: 'u', rankUpdatedAt: null, country: null, averageMonthlySearches: null, competition: null },
    { id: 2, keyword: 'هتل', device: 'android', active: true, checked: true, rank: 9, url: 'u', rankUpdatedAt: null, country: null, averageMonthlySearches: null, competition: null },
  ];
  const r = matchKwRankKeywords([{ id: 'a', term: 'تور کیش' }, { id: 'b', term: 'هتل' }], remote, 'desktop');
  assert.deepStrictEqual(r.matched.map((m) => [m.keywordId, m.remote.id]), [['a', 1]]);
  assert.deepStrictEqual(r.missing.map((m) => m.id), ['b'], 'a mobile row does not answer a desktop project');
  assert.strictEqual(kwRankDevice('mobile'), 'android');
  assert.strictEqual(kwRankDevice('both'), 'desktop');
}
console.log('✅ Persian text matching and device');

console.log('\n✅ ALL KWRank unit tests passed');
