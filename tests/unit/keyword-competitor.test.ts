/**
 * RankForge — KEYWORD_REFRESH + COMPETITOR_CHECK worker wiring: unit tests
 * Proves, with the HTTP layer mocked:
 *  - the worker client builds the real DataForSEO Labs requests
 *    (related_keywords / competitors_domain, Basic auth, location/language)
 *  - response fixtures parse into keyword metrics / competitor rows
 *  - keyword persistence updates ONLY exact normalized matches and
 *    never invents metrics for keywords the provider did not return
 *  - competitor persistence skips the project's own domain and keeps
 *    manual rows' source intact
 */

import assert from 'assert';
import {
  DataForSeoClient,
  persistKeywordMetrics,
  persistCompetitorDiscovery,
} from '../../apps/worker/src/dataforseo.js';

console.log('Testing keyword refresh + competitor discovery (mocked HTTP)...');

// ---------- Fixtures ----------

const keywordFixture = {
  status_code: 20000,
  tasks: [{
    id: 'kw-task-1',
    status_code: 20000,
    result: [{
      items: [
        {
          keyword: 'Example Domain',
          keyword_info: { search_volume: 1200, cpc: 1.234, competition: 0.456 },
          keyword_properties: { keyword_difficulty: 33.6 },
          serp_info: { serp_item_types: ['organic', 'featured_snippet'] },
        },
        {
          keyword: 'example hosting',
          keyword_info: { search_volume: 800, cpc: null, competition: null },
          keyword_properties: { keyword_difficulty: null },
          serp_info: { serp_item_types: ['organic'] },
        },
      ],
    }],
  }],
};

const competitorFixture = {
  status_code: 20000,
  tasks: [{
    id: 'comp-task-1',
    status_code: 20000,
    result: [{
      items: [
        { domain: 'competitor-one.com', avg_position: 12.5, intersections: 42 },
        { domain: 'example.com', avg_position: 8.1, intersections: 100 },
        { domain: 'competitor-two.org', avg_position: 20, intersections: 7 },
      ],
    }],
  }],
};

function mockFetchReturning(payload: any, calls: any[]) {
  return async (url: string, init: any) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  };
}

// ---------- Client: keyword data ----------
{
  const calls: any[] = [];
  const client = new DataForSeoClient('login-x', 'pass-y', mockFetchReturning(keywordFixture, calls));
  const metrics = await client.getKeywordData(['example domain'], { locationCode: 2364, languageCode: 'fa' });

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, 'https://api.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live');
  assert.strictEqual(calls[0].init.headers.Authorization, 'Basic ' + Buffer.from('login-x:pass-y').toString('base64'));
  const body = JSON.parse(calls[0].init.body);
  assert.deepStrictEqual(body[0].keywords, ['example domain']);
  assert.strictEqual(body[0].location_code, 2364);
  assert.strictEqual(body[0].language_code, 'fa');

  assert.strictEqual(metrics.length, 2);
  assert.strictEqual(metrics[0].keyword, 'Example Domain');
  assert.strictEqual(metrics[0].searchVolume, 1200);
  assert.strictEqual(metrics[0].difficulty, 33.6);
  assert.deepStrictEqual(metrics[0].serpFeatures, ['organic', 'featured_snippet']);
  console.log('  ✓ keyword data request + parsing');
}

// ---------- Client: competitors ----------
{
  const calls: any[] = [];
  const client = new DataForSeoClient('login-x', 'pass-y', mockFetchReturning(competitorFixture, calls));
  const competitors = await client.getCompetitorDomains('example.com', { locationCode: 2840, languageCode: 'en' });

  assert.strictEqual(calls[0].url, 'https://api.dataforseo.com/v3/dataforseo_labs/google/competitors_domain/live');
  const body = JSON.parse(calls[0].init.body);
  assert.strictEqual(body[0].target, 'example.com');
  assert.strictEqual(competitors.length, 3);
  assert.strictEqual(competitors[0].domain, 'competitor-one.com');
  assert.strictEqual(competitors[0].intersections, 42);
  console.log('  ✓ competitor request + parsing');
}

// ---------- Persistence: keyword metrics apply exact matches only ----------
{
  const updates: any[] = [];
  const queryDouble = async (text: string, params: any[] = []) => {
    if (text.includes('FROM keywords')) {
      return {
        rows: [
          { id: 'kw-1', match_key: 'example domain' },
          { id: 'kw-2', match_key: 'unrelated tracked term' },
        ],
        rowCount: 2,
      };
    }
    if (text.includes('UPDATE keywords')) {
      updates.push({ text, params });
      return { rows: [], rowCount: 1 };
    }
    throw new Error('unexpected query: ' + text);
  };

  const stats = await persistKeywordMetrics(queryDouble as any, {
    organizationId: 'org-1',
    projectId: 'proj-1',
    metrics: [
      { keyword: 'Example Domain', searchVolume: 1200, cpc: 1.234, competition: 0.456, difficulty: 33.6, serpFeatures: [], raw: {} },
      { keyword: 'example hosting', searchVolume: 800, cpc: null, competition: null, difficulty: null, serpFeatures: [], raw: {} },
    ],
  });

  assert.strictEqual(stats.updated, 1, 'only the exact normalized match is updated');
  assert.strictEqual(stats.notReturned, 1, 'tracked keyword without a provider row is counted, not fabricated');
  assert.strictEqual(updates.length, 1);
  assert.strictEqual(updates[0].params[0], 'kw-1');
  assert.strictEqual(updates[0].params[1], 1200, 'volume written');
  assert.strictEqual(updates[0].params[4], 34, 'difficulty rounded + clamped');
  console.log('  ✓ keyword persistence: exact-match only');
}

// ---------- Persistence: competitors skip self, upsert rest ----------
{
  const inserts: any[] = [];
  let firstCall = true;
  const queryDouble = async (text: string, params: any[] = []) => {
    inserts.push({ text, params });
    const wasInserted = firstCall;
    firstCall = false;
    return { rows: [{ was_inserted: wasInserted }], rowCount: 1 };
  };

  const stats = await persistCompetitorDiscovery(queryDouble as any, {
    organizationId: 'org-1',
    projectId: 'proj-1',
    ownDomain: 'example.com',
    competitors: [
      { domain: 'example.com', intersections: 100, raw: {} },
      { domain: 'competitor-one.com', intersections: 42, raw: {} },
      { domain: 'competitor-two.org', intersections: 7, raw: {} },
    ],
  });

  assert.strictEqual(stats.skippedSelf, 1, 'own domain never stored as its own competitor');
  assert.strictEqual(stats.inserted, 1);
  assert.strictEqual(stats.refreshed, 1);
  assert.strictEqual(inserts.length, 2);
  assert.strictEqual(inserts[0].params[4], 42, 'shared_keywords from provider intersections');
  assert.ok(inserts[0].text.includes("'provider'"), 'new rows are source=provider');
  console.log('  ✓ competitor persistence: skip self + upsert');
}

console.log('✅ keyword-competitor.test.ts — all assertions passed');
