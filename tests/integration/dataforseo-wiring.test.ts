/**
 * RankForge — DataForSEO wiring: integration test against a real database
 *
 * Exercises the exact module functions the worker's RANK_CHECK and
 * BACKLINK_SYNC handlers call (apps/worker/src/dataforseo.ts), with the
 * HTTP layer mocked by DataForSEO-shaped fixtures, and asserts real rows
 * land in keyword_rankings / keywords / backlinks.
 *
 * Requires DATABASE_URL (a migrated RankForge schema). When DATABASE_URL
 * is not set, prints a skip notice and exits 0 — same offline-tolerance
 * convention as the other integration suites.
 */

import assert from 'assert';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('⏭️  DATABASE_URL not set — dataforseo-wiring integration test skipped (offline mode)');
  process.exit(0);
}

console.log('Testing DataForSEO wiring against a real database (mocked HTTP)...');

const { Pool } = await import('pg');
const {
  DataForSeoClient,
  resolveDataForSeoLocationCode,
  resolveDataForSeoLanguageCode,
  findDomainPosition,
  persistRankResult,
  persistBacklinkSync,
} = await import('../../apps/worker/src/dataforseo.js');

// ---------- Fixtures ----------

const serpRanked = {
  status_code: 20000, status_message: 'Ok.',
  tasks: [{
    id: 'it-task-1', status_code: 20000, status_message: 'Ok.',
    result: [{
      keyword: 'example domain', type: 'organic', se_results_count: 1000, item_types: ['organic'],
      items: [
        { type: 'organic', rank_group: 1, domain: 'competitor.example', url: 'https://competitor.example/', title: 'C', description: '' },
        { type: 'organic', rank_group: 2, domain: 'example.com', url: 'https://example.com/landing', title: 'Example Domain', description: '' },
      ],
    }],
  }],
};

const serpNotRanked = {
  status_code: 20000, status_message: 'Ok.',
  tasks: [{
    id: 'it-task-2', status_code: 20000, status_message: 'Ok.',
    result: [{
      keyword: 'unrelated query xyz', type: 'organic', se_results_count: 10, item_types: ['organic'],
      items: [
        { type: 'organic', rank_group: 1, domain: 'other.example', url: 'https://other.example/', title: 'O', description: '' },
      ],
    }],
  }],
};

const backlinksFixture = {
  status_code: 20000, status_message: 'Ok.',
  tasks: [{
    id: 'it-task-3', status_code: 20000, status_message: 'Ok.',
    result: [{
      target: 'example.com', total_count: 2,
      items: [
        { domain_from: 'blog.example.org', url_from: 'https://blog.example.org/post-1', url_to: 'https://example.com/', anchor: 'example site', first_seen: '2026-01-05 10:00:00 +00:00', last_seen: '2026-10-01 10:00:00 +00:00', domain_from_rank: 512, dofollow: true },
        { domain_from: 'dir.example.net', url_from: 'https://dir.example.net/listing', url_to: 'https://example.com/about', anchor: 'about us', first_seen: '2026-03-11 09:30:00 +00:00', last_seen: '2026-09-15 08:00:00 +00:00', domain_from_rank: 233, dofollow: false },
      ],
    }],
  }],
};

const capturedBodies: any[] = [];
const mockFetch = async (url: string, init?: any) => {
  const body = init?.body ? JSON.parse(init.body) : null;
  capturedBodies.push({ url, body });
  if (url.includes('/serp/')) {
    const kw = body?.[0]?.keyword;
    return new Response(JSON.stringify(kw === 'example domain' ? serpRanked : serpNotRanked), { status: 200 });
  }
  if (url.includes('/backlinks/')) return new Response(JSON.stringify(backlinksFixture), { status: 200 });
  throw new Error(`Unexpected URL: ${url}`);
};

// ---------- Setup ----------

const pool = new Pool({ connectionString: DATABASE_URL });
const query = (text: string, params?: any[]) => pool.query(text, params);

const suffix = Math.random().toString(36).slice(2, 10);
let orgId = '';
let userId = '';

try {
  const user = await query(
    `INSERT INTO users (email, password_hash, name) VALUES ($1, 'x', 'DFS Wiring Test') RETURNING id`,
    [`dfs-wiring-${suffix}@example.invalid`],
  );
  userId = user.rows[0].id;

  const org = await query(
    `INSERT INTO organizations (name, slug, owner_id) VALUES ('DFS Wiring Test', $1, $2) RETURNING id`,
    [`dfs-wiring-${suffix}`, userId],
  );
  orgId = org.rows[0].id;

  // Project configured for Iran / Persian — the wiring must honor it end-to-end.
  const project = await query(
    `INSERT INTO projects (organization_id, name, domain, normalized_domain, country, language, device)
     VALUES ($1, 'Example', 'example.com', 'example.com', 'IR', 'fa', 'desktop') RETURNING id`,
    [orgId],
  );
  const projectId = project.rows[0].id;

  const kw1 = await query(
    `INSERT INTO keywords (organization_id, project_id, keyword, normalized_keyword, term, normalized_term, country, language)
     VALUES ($1, $2, 'example domain', 'example domain', 'example domain', 'example domain', 'IR', 'fa') RETURNING id`,
    [orgId, projectId],
  );
  const kw2 = await query(
    `INSERT INTO keywords (organization_id, project_id, keyword, normalized_keyword, term, normalized_term, country, language)
     VALUES ($1, $2, 'unrelated query xyz', 'unrelated query xyz', 'unrelated query xyz', 'unrelated query xyz', 'IR', 'fa') RETURNING id`,
    [orgId, projectId],
  );

  // ---------- Rank flow (same calls the handler makes) ----------

  const client = new DataForSeoClient('dfs-user', 'dfs-pass', mockFetch);
  const locationCode = resolveDataForSeoLocationCode('IR');
  const languageCode = resolveDataForSeoLanguageCode('fa');
  assert.strictEqual(locationCode, 2364);

  for (const [kwId, term] of [[kw1.rows[0].id, 'example domain'], [kw2.rows[0].id, 'unrelated query xyz']] as const) {
    const serp = await client.searchSerp(term, { locationCode, languageCode, device: 'desktop' });
    const hit = findDomainPosition(serp.results, 'example.com');
    await persistRankResult(query as any, {
      organizationId: orgId, projectId, keywordId: kwId,
      position: hit ? hit.position : null, url: hit ? hit.url : null,
      country: 'IR', language: 'fa', device: 'desktop',
      rawData: { requestId: serp.requestId },
    });
  }

  const serpBodies = capturedBodies.filter(c => c.url.includes('/serp/'));
  assert.strictEqual(serpBodies.length, 2);
  assert.ok(serpBodies.every(c => c.body[0].location_code === 2364), 'every SERP request must carry the project location_code 2364');
  assert.ok(serpBodies.every(c => c.body[0].language_code === 'fa'), 'every SERP request must carry language_code fa');

  const rankings = await query(
    `SELECT keyword_id, position, country, language, provider FROM keyword_rankings WHERE project_id = $1 ORDER BY position NULLS LAST`,
    [projectId],
  );
  assert.strictEqual(rankings.rows.length, 2, 'one history row per tracked keyword');
  assert.strictEqual(rankings.rows[0].position, 2, 'ranked keyword persisted with position 2');
  assert.strictEqual(rankings.rows[0].country, 'IR');
  assert.strictEqual(rankings.rows[0].language, 'fa');
  assert.strictEqual(rankings.rows[0].provider, 'dataforseo');
  assert.strictEqual(rankings.rows[1].position, null, 'unranked keyword persisted with NULL position — real absence, not a fake rank');

  const kwState = await query(`SELECT current_position FROM keywords WHERE id = $1`, [kw1.rows[0].id]);
  assert.strictEqual(kwState.rows[0].current_position, 2, 'keyword current_position advanced to 2');
  console.log('✅ Rank flow: IR/fa requests → keyword_rankings rows (2 and NULL) + keyword state updated');

  // ---------- Backlink flow (same calls the handler makes) ----------

  // Pre-existing provider row that the new fixture no longer contains → must become 'lost'.
  await query(
    `INSERT INTO backlinks (project_id, organization_id, source_url, source_domain, target_url, status, provider, first_seen_at, last_seen_at)
     VALUES ($1, $2, 'https://stale.example.net/old', 'stale.example.net', 'https://example.com/', 'active', 'dataforseo', NOW() - INTERVAL '30 days', NOW() - INTERVAL '2 days')`,
    [projectId, orgId],
  );

  const links = await client.getBacklinks('example.com');
  const stats = await persistBacklinkSync(query as any, {
    organizationId: orgId, projectId, backlinks: links, syncStartedAt: new Date(),
  });
  assert.deepStrictEqual(stats, { fetched: 2, inserted: 2, refreshed: 0, lost: 1 });

  const blRows = await query(
    `SELECT source_url, status, is_nofollow, domain_rating FROM backlinks WHERE project_id = $1 ORDER BY source_url`,
    [projectId],
  );
  assert.strictEqual(blRows.rows.length, 3);
  const byUrl = Object.fromEntries(blRows.rows.map((r: any) => [r.source_url, r]));
  assert.strictEqual(byUrl['https://blog.example.org/post-1'].status, 'active');
  assert.strictEqual(byUrl['https://blog.example.org/post-1'].is_nofollow, false);
  assert.strictEqual(byUrl['https://blog.example.org/post-1'].domain_rating, 512);
  assert.strictEqual(byUrl['https://dir.example.net/listing'].is_nofollow, true);
  assert.strictEqual(byUrl['https://stale.example.net/old'].status, 'lost', 'stale provider backlink must be marked lost');

  // Second sync with the same fixture → refresh only, nothing new, nothing lost.
  const stats2 = await persistBacklinkSync(query as any, {
    organizationId: orgId, projectId, backlinks: links, syncStartedAt: new Date(),
  });
  assert.deepStrictEqual(stats2, { fetched: 2, inserted: 0, refreshed: 2, lost: 0 });
  console.log('✅ Backlink flow: 2 inserted + stale marked lost; re-sync refreshes without duplication');

  console.log('\n✅ DataForSEO wiring integration test passed (real DB rows verified)');
} finally {
  if (orgId) await query(`DELETE FROM organizations WHERE id = $1`, [orgId]).catch(() => {});
  if (userId) await query(`DELETE FROM users WHERE id = $1`, [userId]).catch(() => {});
  await pool.end();
}
