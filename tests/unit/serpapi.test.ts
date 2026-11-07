/**
 * SerpApi rank lookup with the HTTP layer replaced by recorded-shape responses.
 * Proves the requests, paging, absolute positions, early stop and error handling.
 * A real search needs SERPAPI_KEY and is not run here.
 */
import assert from 'assert';
import { SerpApiClient, SerpApiError, rankDepth } from '../../apps/worker/src/serpapi.js';
import { findDomainPosition } from '../../apps/worker/src/dataforseo.js';

console.log('Testing SerpApi rank lookup (HTTP replaced)...');

function page(start: number, links: string[], next = true) {
  return {
    search_metadata: { id: `search-${start}`, status: 'Success' },
    search_information: { total_results: 1230000 },
    organic_results: links.map((link, i) => ({ position: i + 1, title: `t${start + i}`, link, snippet: 's' })),
    serpapi_pagination: next ? { next: `https://serpapi.com/search.json?start=${start + 10}` } : undefined,
  };
}
const filler = (start: number, n = 10) => Array.from({ length: n }, (_, i) => `https://other${start + i}.ir/page`);

function fakeFetch(pages: Record<number, any>, calls: URL[], status = 200) {
  return async (url: string) => {
    const u = new URL(url);
    calls.push(u);
    const body = pages[Number(u.searchParams.get('start') ?? 0)] ?? page(0, [], false);
    return { ok: status < 400, status, text: async () => JSON.stringify(body) };
  };
}

// The site is on page 2: two searches, absolute position 14, no third page.
{
  const calls: URL[] = [];
  const pages = { 0: page(0, filler(0)), 10: page(10, [...filler(10, 3), 'https://www.gardima.ir/tour/kish', ...filler(14, 6)]), 20: page(20, filler(20)) };
  const client = new SerpApiClient('test-key', 'https://serpapi.example/', fakeFetch(pages, calls));
  const out = await client.searchSerp('تور کیش', { country: 'IR', language: 'fa', device: 'mobile', depth: 50, targetDomain: 'gardima.ir' });
  assert.strictEqual(out.requests, 2, 'stops paging once the site is found');
  assert.strictEqual(calls.length, 2);
  const first = calls[0];
  assert.strictEqual(first.origin + first.pathname, 'https://serpapi.example/search.json');
  assert.strictEqual(first.searchParams.get('engine'), 'google');
  assert.strictEqual(first.searchParams.get('q'), 'تور کیش');
  assert.strictEqual(first.searchParams.get('gl'), 'ir');
  assert.strictEqual(first.searchParams.get('hl'), 'fa');
  assert.strictEqual(first.searchParams.get('device'), 'mobile');
  assert.strictEqual(first.searchParams.get('api_key'), 'test-key');
  assert.strictEqual(first.searchParams.get('start'), null);
  assert.strictEqual(calls[1].searchParams.get('start'), '10');
  const hit = findDomainPosition(out.results, 'gardima.ir');
  assert.ok(hit, 'the site is found');
  assert.strictEqual(hit!.position, 14, 'position counts across pages');
  assert.strictEqual(hit!.url, 'https://www.gardima.ir/tour/kish');
  assert.strictEqual(out.requestId, 'search-0');
  assert.strictEqual(out.totalResults, 1230000);
}
console.log('✅ pages until found, absolute position, request parameters');

// Not ranked: stops at the depth and reports no position.
{
  const calls: URL[] = [];
  const pages = { 0: page(0, filler(0)), 10: page(10, filler(10)), 20: page(20, filler(20)), 30: page(30, filler(30)) };
  const client = new SerpApiClient('k', undefined, fakeFetch(pages, calls));
  const out = await client.searchSerp('x', { country: 'IR', language: 'fa', device: 'desktop', depth: 30, targetDomain: 'gardima.ir' });
  assert.strictEqual(calls.length, 3, 'depth 30 is three searches');
  assert.strictEqual(out.results.length, 30);
  assert.strictEqual(findDomainPosition(out.results, 'gardima.ir'), null);
  assert.strictEqual(calls[0].origin, 'https://serpapi.com');
}
console.log('✅ not ranked within the depth → no position, no extra searches');

// Overlapping pages do not shift positions, and a short SERP ends early.
{
  const calls: URL[] = [];
  const pages = { 0: page(0, filler(0)), 10: page(10, ['https://other9.ir/page', 'https://gardima.ir/'], false) };
  const client = new SerpApiClient('k', undefined, fakeFetch(pages, calls));
  const out = await client.searchSerp('x', { country: 'IR', language: 'fa', device: 'desktop', depth: 100, targetDomain: 'example.com' });
  assert.strictEqual(calls.length, 2, 'no next page → stop');
  assert.strictEqual(findDomainPosition(out.results, 'gardima.ir')!.position, 11);
}
console.log('✅ duplicates skipped, ends with the SERP');

// An empty SERP is a result, not an error.
{
  const client = new SerpApiClient('k', undefined, async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ error: "Google hasn't returned any results for this query." }) }));
  const out = await client.searchSerp('x', { country: 'IR', language: 'fa', device: 'desktop', depth: 50 });
  assert.strictEqual(out.results.length, 0);
}
console.log('✅ empty SERP → no position');

// Account problems surface with the provider's message.
for (const [status, body] of [[401, { error: 'Invalid API key. Your API key should be here: https://serpapi.com/manage-api-key' }], [200, { error: 'Your account has run out of searches.' }]] as const) {
  const client = new SerpApiClient('bad', undefined, async () => ({ ok: status < 400, status, text: async () => JSON.stringify(body) }));
  await assert.rejects(client.searchSerp('x', { country: 'IR', language: 'fa', device: 'desktop', depth: 10 }), (e: unknown) => {
    assert.ok(e instanceof SerpApiError);
    assert.ok((e as Error).message.includes(body.error.slice(0, 20)));
    return true;
  });
}
console.log('✅ invalid key and exhausted plan surface as errors');

assert.strictEqual(rankDepth(undefined), 50);
assert.strictEqual(rankDepth(''), 50);
assert.strictEqual(rankDepth('7'), 10);
assert.strictEqual(rankDepth('34'), 30);
assert.strictEqual(rankDepth('500'), 100);
console.log('✅ depth setting is bounded to 10–100 in steps of 10');

console.log('\n✅ ALL SerpApi unit tests passed');
