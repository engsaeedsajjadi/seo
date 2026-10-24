/**
 * RankForge — DataForSEO worker wiring: unit tests
 * Proves, with the HTTP layer mocked:
 *  - project country/language → DataForSEO location_code/language_code mapping
 *  - the client builds the real requests (endpoint, Basic auth, payload)
 *  - SERP / backlink fixture responses parse correctly
 *  - persistence helpers write rank + backlink rows via the query function
 *  - provider errors surface (never swallowed, never replaced by fake data)
 */

import assert from 'assert';
import {
  DataForSeoClient,
  DataForSeoError,
  resolveDataForSeoLocationCode,
  resolveDataForSeoLanguageCode,
  findDomainPosition,
  normalizeDomainForMatch,
  persistRankResult,
  persistBacklinkSync,
} from '../../apps/worker/src/dataforseo.js';

console.log('Testing DataForSEO worker wiring (mocked HTTP)...');

// ---------- Fixtures (DataForSEO live response shapes) ----------

const serpFixtureRanked = {
  version: '0.1.20260101',
  status_code: 20000,
  status_message: 'Ok.',
  tasks: [{
    id: 'fixture-task-1',
    status_code: 20000,
    status_message: 'Ok.',
    result: [{
      keyword: 'example domain',
      type: 'organic',
      se_results_count: 184000,
      item_types: ['paid', 'organic'],
      items: [
        { type: 'paid', rank_group: 1, domain: 'ads.example.net', url: 'https://ads.example.net/buy', title: 'Ad', description: 'ad' },
        { type: 'organic', rank_group: 1, rank_absolute: 2, domain: 'competitor.example', url: 'https://competitor.example/page', title: 'Competitor', description: 'comp' },
        { type: 'organic', rank_group: 2, rank_absolute: 3, domain: 'example.com', url: 'https://example.com/landing', title: 'Example Domain', description: 'example desc' },
      ],
    }],
  }],
};

const serpFixtureNotRanked = {
  status_code: 20000,
  status_message: 'Ok.',
  tasks: [{
    id: 'fixture-task-2',
    status_code: 20000,
    status_message: 'Ok.',
    result: [{
      keyword: 'unrelated query xyz',
      type: 'organic',
      se_results_count: 55,
      item_types: ['organic'],
      items: [
        { type: 'organic', rank_group: 1, domain: 'someone-else.example', url: 'https://someone-else.example/', title: 'Other', description: 'x' },
      ],
    }],
  }],
};

const backlinksFixture = {
  status_code: 20000,
  status_message: 'Ok.',
  tasks: [{
    id: 'fixture-task-3',
    status_code: 20000,
    status_message: 'Ok.',
    result: [{
      target: 'example.com',
      total_count: 2,
      items: [
        {
          type: 'anchor', domain_from: 'blog.example.org', url_from: 'https://blog.example.org/post-1',
          domain_to: 'example.com', url_to: 'https://example.com/', anchor: 'example site',
          first_seen: '2026-01-05 10:00:00 +00:00', last_seen: '2026-10-01 10:00:00 +00:00',
          domain_from_rank: 512, dofollow: true,
        },
        {
          type: 'anchor', domain_from: 'dir.example.net', url_from: 'https://dir.example.net/listing',
          domain_to: 'example.com', url_to: 'https://example.com/about', anchor: 'about us',
          first_seen: '2026-03-11 09:30:00 +00:00', last_seen: '2026-09-15 08:00:00 +00:00',
          domain_from_rank: 233, dofollow: false,
        },
      ],
    }],
  }],
};

// ---------- Mock fetch ----------

interface CapturedCall { url: string; init: any }
const calls: CapturedCall[] = [];

function mockFetch(fixtures: { serp?: any; backlinks?: any; status?: number; errorBody?: string }) {
  return async (url: string, init?: any) => {
    calls.push({ url, init });
    if (fixtures.status && fixtures.status !== 200) {
      return new Response(fixtures.errorBody || 'error', { status: fixtures.status });
    }
    if (url.includes('/serp/google/organic/live/advanced')) return new Response(JSON.stringify(fixtures.serp), { status: 200 });
    if (url.includes('/backlinks/backlinks/live')) return new Response(JSON.stringify(fixtures.backlinks), { status: 200 });
    throw new Error(`Unexpected URL in mock fetch: ${url}`);
  };
}

// ---------- Test 1: location/language mapping ----------

console.log('Test 1: country/language → DataForSEO codes');
assert.strictEqual(resolveDataForSeoLocationCode('US'), 2840);
assert.strictEqual(resolveDataForSeoLocationCode('IR'), 2364, 'Iran must map to 2364');
assert.strictEqual(resolveDataForSeoLocationCode('ir'), 2364, 'mapping is case-insensitive');
assert.strictEqual(resolveDataForSeoLocationCode(undefined), 2840, 'unset country falls back to US');
assert.strictEqual(resolveDataForSeoLocationCode(null), 2840);
assert.strictEqual(resolveDataForSeoLocationCode('XX'), 2840, 'unknown country falls back to US');
assert.strictEqual(resolveDataForSeoLanguageCode('fa'), 'fa');
assert.strictEqual(resolveDataForSeoLanguageCode('FA'), 'fa');
assert.strictEqual(resolveDataForSeoLanguageCode(undefined), 'en');
console.log('✅ Location/language mapping correct (IR→2364/fa, fallback US only when unset)');

// ---------- Test 2: not configured ----------

console.log('Test 2: unconfigured client refuses without fabricating');
const unconfigured = new DataForSeoClient('', '', mockFetch({}));
assert.strictEqual(unconfigured.isConfigured(), false);
await assert.rejects(
  () => unconfigured.searchSerp('x', { locationCode: 2840, languageCode: 'en' }),
  /not configured/i,
);
assert.strictEqual(calls.length, 0, 'no HTTP call may happen when unconfigured');
console.log('✅ Unconfigured client throws before any HTTP call');

// ---------- Test 3: SERP request construction + parsing ----------

console.log('Test 3: SERP request shape and rank parsing');
calls.length = 0;
const client = new DataForSeoClient('dfs-user', 'dfs-pass', mockFetch({ serp: serpFixtureRanked, backlinks: backlinksFixture }));
assert.strictEqual(client.isConfigured(), true);

const outcome = await client.searchSerp('example domain', {
  locationCode: resolveDataForSeoLocationCode('IR'),
  languageCode: resolveDataForSeoLanguageCode('fa'),
  device: 'desktop',
});

assert.strictEqual(calls.length, 1);
const serpCall = calls[0];
assert.strictEqual(serpCall.url, 'https://api.dataforseo.com/v3/serp/google/organic/live/advanced');
assert.strictEqual(serpCall.init.method, 'POST');
assert.strictEqual(
  serpCall.init.headers.Authorization,
  'Basic ' + Buffer.from('dfs-user:dfs-pass').toString('base64'),
  'Basic auth header must carry the configured credentials',
);
const serpBody = JSON.parse(serpCall.init.body);
assert.strictEqual(serpBody[0].keyword, 'example domain');
assert.strictEqual(serpBody[0].location_code, 2364, 'project country IR → location_code 2364 in the wire payload');
assert.strictEqual(serpBody[0].language_code, 'fa', 'project language fa → language_code fa in the wire payload');
assert.strictEqual(serpBody[0].device, 'desktop');

assert.strictEqual(outcome.results.length, 2, 'paid item must be filtered out of organic results');
const hit = findDomainPosition(outcome.results, 'example.com');
assert.ok(hit, 'domain must be found');
assert.strictEqual(hit!.position, 2, 'rank_group of the domain item is the position');
assert.strictEqual(hit!.url, 'https://example.com/landing');
console.log('✅ SERP request carries project location/language; paid filtered; position parsed = 2');

// ---------- Test 4: not-ranked keyword ----------

console.log('Test 4: domain absent from SERP → null position (not fabricated)');
const client2 = new DataForSeoClient('u', 'p', mockFetch({ serp: serpFixtureNotRanked }));
const outcome2 = await client2.searchSerp('unrelated query xyz', { locationCode: 2840, languageCode: 'en' });
assert.strictEqual(findDomainPosition(outcome2.results, 'example.com'), null);
assert.strictEqual(normalizeDomainForMatch('https://www.Example.com/path?q=1'), 'example.com');
console.log('✅ Absent domain yields null, www/scheme normalization works');

// ---------- Test 5: backlinks request + parsing ----------

console.log('Test 5: backlinks request shape and item parsing');
calls.length = 0;
const links = await client.getBacklinks('example.com');
assert.strictEqual(calls.length, 1);
assert.strictEqual(calls[0].url, 'https://api.dataforseo.com/v3/backlinks/backlinks/live');
const blBody = JSON.parse(calls[0].init.body);
assert.strictEqual(blBody[0].target, 'example.com');
assert.strictEqual(links.length, 2);
assert.strictEqual(links[0].sourceDomain, 'blog.example.org');
assert.strictEqual(links[0].sourceUrl, 'https://blog.example.org/post-1');
assert.strictEqual(links[0].targetUrl, 'https://example.com/');
assert.strictEqual(links[0].domainRating, 512);
assert.strictEqual(links[0].isNofollow, false, 'dofollow=true → isNofollow=false');
assert.strictEqual(links[1].isNofollow, true, 'dofollow=false → isNofollow=true');
console.log('✅ Backlinks parsed with source/target/anchor/rank/nofollow mapping');

// ---------- Test 6: rank persistence (recording query double) ----------

console.log('Test 6: persistRankResult writes history + advances keyword state');
const recorded: Array<{ text: string; params: any[] }> = [];
const recordingQuery = async (text: string, params?: any[]) => {
  recorded.push({ text, params: params || [] });
  if (text.includes('SELECT current_position FROM keywords')) {
    return { rows: [{ current_position: 5 }], rowCount: 1 };
  }
  return { rows: [], rowCount: 1 };
};

const { previousPosition } = await persistRankResult(recordingQuery as any, {
  organizationId: 'org-1', projectId: 'proj-1', keywordId: 'kw-1',
  position: 2, url: 'https://example.com/landing',
  country: 'IR', language: 'fa', device: 'desktop',
  rawData: { requestId: 'fixture-task-1' },
});
assert.strictEqual(previousPosition, 5, 'previous position comes from the keyword state before this check');
const rankInsert = recorded.find(r => r.text.includes('INSERT INTO keyword_rankings'));
assert.ok(rankInsert, 'a keyword_rankings history row must be inserted');
assert.strictEqual(rankInsert!.params[3], 2, 'new position persisted');
assert.strictEqual(rankInsert!.params[4], 5, 'previous_position persisted alongside');
assert.strictEqual(rankInsert!.params[7], 'IR');
assert.strictEqual(rankInsert!.params[8], 'fa');
assert.ok(rankInsert!.text.includes('ON CONFLICT'), 'same-day re-check must upsert, not duplicate');
const kwUpdate = recorded.find(r => r.text.includes('UPDATE keywords SET'));
assert.ok(kwUpdate, 'keyword current_position must advance');
assert.strictEqual(kwUpdate!.params[2], 2);
console.log('✅ Rank persistence: history row (pos 2, prev 5, IR/fa) + keyword state advanced');

// ---------- Test 7: backlink persistence (recording query double) ----------

console.log('Test 7: persistBacklinkSync upserts and marks lost');
recorded.length = 0;
let insertCount = 0;
const blQuery = async (text: string, params?: any[]) => {
  recorded.push({ text, params: params || [] });
  if (text.includes('INSERT INTO backlinks')) {
    insertCount++;
    return { rows: [{ was_inserted: insertCount <= 2 }], rowCount: 1 };
  }
  if (text.includes("status = 'lost'")) return { rows: [], rowCount: 3 };
  return { rows: [], rowCount: 0 };
};
const stats = await persistBacklinkSync(blQuery as any, {
  organizationId: 'org-1', projectId: 'proj-1', backlinks: links, syncStartedAt: new Date(),
});
assert.deepStrictEqual(stats, { fetched: 2, inserted: 2, refreshed: 0, lost: 3 });
const blInsert = recorded.find(r => r.text.includes('INSERT INTO backlinks'));
assert.ok(blInsert!.text.includes('ON CONFLICT (project_id, source_url, target_url)'));
const lostUpdate = recorded.find(r => r.text.includes("status = 'lost'"));
assert.ok(lostUpdate, 'stale provider rows must be marked lost');
assert.ok(lostUpdate!.text.includes("provider = 'dataforseo'"), 'lost-marking must only touch provider rows');
console.log('✅ Backlink persistence: upserts counted, stale rows marked lost');

// ---------- Test 8: provider auth error surfaces verbatim ----------

console.log('Test 8: provider 401 surfaces as DataForSeoError with status + body');
const authFailClient = new DataForSeoClient('bad', 'creds', mockFetch({ status: 401, errorBody: '{"status_code":40100,"status_message":"Invalid credentials."}' }));
try {
  await authFailClient.searchSerp('x', { locationCode: 2840, languageCode: 'en' });
  assert.fail('should have thrown');
} catch (e) {
  assert.ok(e instanceof DataForSeoError);
  assert.strictEqual((e as DataForSeoError).httpStatus, 401);
  assert.ok((e as Error).message.includes('401'), 'HTTP status must be in the error message');
  assert.ok((e as Error).message.includes('Invalid credentials'), 'provider response body must surface');
}
console.log('✅ Provider auth failure surfaces (status + body), not a stub message');

console.log('\n✅ ALL DataForSEO wiring unit tests passed');
