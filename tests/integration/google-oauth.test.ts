/**
 * RankForge — Google OAuth (phase 4): integration test against a real database
 *
 * Exercises the full Google loop with Google's HTTP endpoints mocked:
 *   simulated OAuth callback (service core the route calls)
 *     → encrypted token bundle stored on org connection rows
 *     → property lists parsed from fixture API responses
 *     → project binding persisted (siteUrl / propertyId + token copy)
 *     → GSC_SYNC / GA4_SYNC core (the exact functions the worker
 *       handlers call) writes fixture-derived metric rows
 *     → expired stored token triggers a mocked refresh, persisted
 *   plus the honest not-configured / not-connected states.
 *
 * Requires DATABASE_URL (a migrated RankForge schema). When DATABASE_URL
 * is not set, prints a skip notice and exits 0 — same offline-tolerance
 * convention as the other integration suites.
 */

import assert from 'assert';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('⏭️  DATABASE_URL not set — google-oauth integration test skipped (offline mode)');
  process.exit(0);
}

// Env must be set before importing API modules (config is a singleton).
process.env.GOOGLE_CLIENT_ID = 'it-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'it-client-secret';
process.env.ENCRYPTION_KEY = 'google-oauth-integration-test-key';

console.log('Testing Google OAuth loop against a real database (mocked Google HTTP)...');

const { Pool } = await import('pg');
const pool = new Pool({ connectionString: DATABASE_URL });
const query = (text: string, params?: any[]) => pool.query(text, params);

const {
  GoogleClient,
  createOAuthState,
  parseStoredTokens,
} = await import('../../apps/api/src/lib/google.js');
const { googleService } = await import('../../apps/api/src/services/google.service.js');
const { googleIntegrationRepository } = await import('../../apps/api/src/repositories/google-integration.repository.js');
const {
  GoogleWorkerClient,
  ensureValidAccessToken,
  buildGscRequestBody,
  buildGa4RequestBody,
  mapGscSearchAnalyticsResponse,
  mapGa4ReportResponse,
  persistGscMetrics,
  persistGa4Metrics,
  serializeTokens,
} = await import('../../apps/worker/src/google.js');

// ---------- Fixtures (Google API response shapes) ----------

const ACCESS_TOKEN = 'ya29.it-access-token';
const REFRESH_TOKEN = '1//it-refresh-token';
const REFRESHED_ACCESS_TOKEN = 'ya29.it-refreshed-token';

const gscSitesFixture = {
  siteEntry: [
    { siteUrl: 'https://example.com/', permissionLevel: 'siteOwner' },
    { siteUrl: 'sc-domain:example.org', permissionLevel: 'siteFullUser' },
  ],
};

const ga4SummariesFixture = {
  accountSummaries: [
    {
      account: 'accounts/111', displayName: 'Main Account',
      propertySummaries: [{ property: 'properties/222', displayName: 'Example GA4' }],
    },
  ],
};

const gscRowsFixture = {
  rows: [
    { keys: ['2026-10-19', 'example query', 'https://example.com/', 'usa', 'DESKTOP'], clicks: 12, impressions: 340, ctr: 0.0353, position: 4.2 },
    { keys: ['2026-10-19', 'example query', 'https://example.com/', 'irn', 'MOBILE'], clicks: 3, impressions: 90, ctr: 0.0333, position: 6.75 },
  ],
  responseAggregationType: 'byProperty',
};

const ga4RowsFixture = {
  dimensionHeaders: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
  metricHeaders: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'conversions' }, { name: 'screenPageViews' }],
  rows: [
    { dimensionValues: [{ value: '20261019' }, { value: 'Organic Search' }], metricValues: [{ value: '120' }, { value: '98' }, { value: '4' }, { value: '310' }] },
    { dimensionValues: [{ value: '20261019' }, { value: 'Direct' }], metricValues: [{ value: '55' }, { value: '50' }, { value: '1' }, { value: '140' }] },
  ],
  rowCount: 2,
};

// ---------- Mock Google HTTP (records every call) ----------

const httpCalls: { url: string; method: string; body?: string; auth?: string }[] = [];

function jsonResponse(json: any, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => json };
}

async function mockGoogleFetch(url: string, init?: any): Promise<any> {
  const method = init?.method || 'GET';
  httpCalls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined, auth: init?.headers?.Authorization });

  if (url === 'https://oauth2.googleapis.com/token') {
    const params = new URLSearchParams(init.body);
    if (params.get('grant_type') === 'authorization_code') {
      assert.strictEqual(params.get('code'), 'it-auth-code');
      return jsonResponse({ access_token: ACCESS_TOKEN, refresh_token: REFRESH_TOKEN, expires_in: 3600, scope: 'openid email', token_type: 'Bearer' });
    }
    if (params.get('grant_type') === 'refresh_token') {
      assert.strictEqual(params.get('refresh_token'), REFRESH_TOKEN);
      return jsonResponse({ access_token: REFRESHED_ACCESS_TOKEN, expires_in: 3600, token_type: 'Bearer' });
    }
    throw new Error(`Unexpected token grant: ${params.get('grant_type')}`);
  }
  if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
    return jsonResponse({ email: 'owner@example.com', email_verified: true });
  }
  if (url === 'https://searchconsole.googleapis.com/webmasters/v3/sites') {
    return jsonResponse(gscSitesFixture);
  }
  if (url === 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries') {
    return jsonResponse(ga4SummariesFixture);
  }
  if (url.includes('/searchAnalytics/query')) {
    return jsonResponse(gscRowsFixture);
  }
  if (url.includes(':runReport')) {
    return jsonResponse(ga4RowsFixture);
  }
  if (url === 'https://oauth2.googleapis.com/revoke') {
    return jsonResponse({});
  }
  throw new Error(`Unmocked Google URL: ${url}`);
}

// The API service's internal client resolves the global fetch — patch it.
(globalThis as any).fetch = mockGoogleFetch;

const suffix = Math.random().toString(36).slice(2, 10);
let orgId: string | undefined;
let userId: string | undefined;

try {
  // ---------- Throwaway org / user / project ----------
  const user = await query(
    `INSERT INTO users (email, password_hash, name) VALUES ($1, 'x', 'Google OAuth Test') RETURNING id`,
    [`google-oauth-${suffix}@example.invalid`]
  );
  userId = user.rows[0].id;
  const org = await query(
    `INSERT INTO organizations (name, slug, owner_id) VALUES ('Google OAuth Test', $1, $2) RETURNING id`,
    [`google-oauth-${suffix}`, userId]
  );
  orgId = org.rows[0].id;
  const project = await query(
    `INSERT INTO projects (organization_id, name, domain, normalized_domain, country, language, device)
     VALUES ($1, 'Example', 'example.com', 'example.com', 'US', 'en', 'desktop') RETURNING id`,
    [orgId]
  );
  const projectId = project.rows[0].id;

  // ---------- Not-connected honesty (before any OAuth) ----------
  {
    const status = await googleService.getConnectionStatus(orgId);
    assert.strictEqual(status.configured, true);
    assert.strictEqual(status.connected, false);
    await assert.rejects(
      () => googleService.listGscSites(orgId!),
      (e: any) => e.code === 'GOOGLE_NOT_CONNECTED'
    );
    await assert.rejects(
      () => googleService.bindProjectProperty(orgId!, projectId, 'gsc', { siteUrl: 'https://example.com/' }),
      (e: any) => e.code === 'GOOGLE_NOT_CONNECTED'
    );
    console.log('  ✓ before connect: status honest, list + bind refuse as GOOGLE_NOT_CONNECTED');
  }

  // ---------- Simulated OAuth callback → encrypted storage ----------
  {
    const state = createOAuthState({ organizationId: orgId, userId });
    const apiClient = new GoogleClient({
      clientId: 'it-client-id', clientSecret: 'it-client-secret',
      redirectUri: 'http://localhost:3001/api/v1/integrations/google/callback',
      fetchFn: mockGoogleFetch,
    });
    const result = await googleService.handleOAuthCallback('it-auth-code', state, apiClient);
    assert.strictEqual(result.organizationId, orgId);
    assert.strictEqual(result.email, 'owner@example.com');

    for (const provider of ['gsc', 'ga4'] as const) {
      const row = await googleIntegrationRepository.getOrgConnection(orgId, provider);
      assert.ok(row, `${provider} org connection row exists`);
      assert.strictEqual(row!.status, 'connected');
      assert.strictEqual(row!.config.email, 'owner@example.com');
      assert.ok(Buffer.isBuffer(row!.credentialsEncrypted), 'credentials stored as BYTEA');
      const raw = row!.credentialsEncrypted!.toString('utf8');
      assert.ok(!raw.includes(ACCESS_TOKEN), 'stored bytes must NOT contain the plaintext access token');
      assert.ok(!raw.includes(REFRESH_TOKEN), 'stored bytes must NOT contain the plaintext refresh token');
      const tokens = parseStoredTokens(row!.credentialsEncrypted);
      assert.strictEqual(tokens?.accessToken, ACCESS_TOKEN);
      assert.strictEqual(tokens?.refreshToken, REFRESH_TOKEN);
    }

    // Tampered state is rejected before any token exchange
    const callsBefore = httpCalls.length;
    await assert.rejects(
      () => googleService.handleOAuthCallback('it-auth-code', 'forged.state', apiClient),
      (e: any) => e.code === 'INVALID_STATE'
    );
    assert.strictEqual(httpCalls.length, callsBefore, 'no token call made for forged state');
    console.log('  ✓ callback: both org rows connected, tokens encrypted at rest, forged state rejected');
  }

  // ---------- Property lists (via service → mocked Google APIs) ----------
  {
    const sites = await googleService.listGscSites(orgId);
    assert.deepStrictEqual(sites.map((s: any) => s.siteUrl), ['https://example.com/', 'sc-domain:example.org']);
    const properties = await googleService.listGa4Properties(orgId);
    assert.deepStrictEqual(properties, [{ propertyId: 'properties/222', displayName: 'Example GA4', accountName: 'Main Account' }]);
    console.log('  ✓ property discovery: GSC sites + GA4 properties from the connected account');
  }

  // ---------- Project binding ----------
  {
    const gscRow = await googleService.bindProjectProperty(orgId, projectId, 'gsc', { siteUrl: 'https://example.com/' });
    assert.strictEqual(gscRow.status, 'connected');
    assert.strictEqual(gscRow.config.siteUrl, 'https://example.com/');
    const copied = parseStoredTokens(gscRow.credentialsEncrypted);
    assert.strictEqual(copied?.refreshToken, REFRESH_TOKEN, 'binding copies the org token bundle for the worker');

    const ga4Row = await googleService.bindProjectProperty(orgId, projectId, 'ga4', { propertyId: 'properties/222', propertyName: 'Example GA4' });
    assert.strictEqual(ga4Row.config.propertyId, 'properties/222');
    console.log('  ✓ binding: project rows persisted with property config + token copy');
  }

  // ---------- Worker sync core: GSC ----------
  {
    const integration = (await query(
      `SELECT id, credentials_encrypted as "credentialsEncrypted" FROM integrations WHERE organization_id = $1 AND project_id = $2 AND provider = 'gsc'`,
      [orgId, projectId]
    )).rows[0];
    const workerClient = new GoogleWorkerClient({ clientId: 'it-client-id', clientSecret: 'it-client-secret', fetchFn: mockGoogleFetch });
    const accessToken = await ensureValidAccessToken(query, integration, workerClient);
    assert.strictEqual(accessToken, ACCESS_TOKEN, 'fresh stored token used without refresh');

    const json = await workerClient.querySearchAnalytics(accessToken, 'https://example.com/', buildGscRequestBody({ startDate: '2026-09-22', endDate: '2026-10-19' }));
    const rows = mapGscSearchAnalyticsResponse(json);
    const stats = await persistGscMetrics(query, { organizationId: orgId, projectId, rows });
    assert.strictEqual(stats.imported, 2);

    const stored = await query(`SELECT date::text, clicks, impressions, country, device FROM gsc_metrics WHERE project_id = $1 ORDER BY country`, [projectId]);
    assert.strictEqual(stored.rows.length, 2);
    assert.strictEqual(stored.rows[0].clicks, 3); // irn sorts before usa
    assert.strictEqual(stored.rows[0].country, 'irn');
    assert.strictEqual(stored.rows[1].clicks, 12);
    assert.strictEqual(stored.rows[1].country, 'usa');
    console.log('  ✓ GSC sync core: fixture rows landed in gsc_metrics (alpha-3 country intact)');
  }

  // ---------- Worker sync core: GA4 ----------
  {
    const integration = (await query(
      `SELECT id, credentials_encrypted as "credentialsEncrypted" FROM integrations WHERE organization_id = $1 AND project_id = $2 AND provider = 'ga4'`,
      [orgId, projectId]
    )).rows[0];
    const workerClient = new GoogleWorkerClient({ clientId: 'it-client-id', clientSecret: 'it-client-secret', fetchFn: mockGoogleFetch });
    const accessToken = await ensureValidAccessToken(query, integration, workerClient);
    const json = await workerClient.runGa4Report(accessToken, 'properties/222', buildGa4RequestBody({ startDate: '2026-09-24', endDate: '2026-10-21' }));
    const rows = mapGa4ReportResponse(json);
    const stats = await persistGa4Metrics(query, { organizationId: orgId, projectId, rows });
    assert.strictEqual(stats.imported, 2);

    const stored = await query(`SELECT date::text, channel, sessions, users, organic_users FROM ga4_metrics WHERE project_id = $1 ORDER BY channel`, [projectId]);
    assert.strictEqual(stored.rows.length, 2);
    const organic = stored.rows.find((r: any) => r.channel === 'Organic Search');
    const direct = stored.rows.find((r: any) => r.channel === 'Direct');
    assert.strictEqual(organic.sessions, 120);
    assert.strictEqual(organic.organic_users, 98);
    assert.strictEqual(direct.organic_users, 0);
    assert.strictEqual(organic.date, '2026-10-19');
    console.log('  ✓ GA4 sync core: channel-grained rows landed in ga4_metrics');
  }

  // ---------- Expired token → mocked refresh, persisted ----------
  {
    const integration = (await query(
      `SELECT id, credentials_encrypted as "credentialsEncrypted" FROM integrations WHERE organization_id = $1 AND project_id = $2 AND provider = 'gsc'`,
      [orgId, projectId]
    )).rows[0];
    // Force the stored bundle stale
    const stale = serializeTokens({ accessToken: 'ya29.stale', refreshToken: REFRESH_TOKEN, expiresAt: Date.now() - 1000 });
    await query(`UPDATE integrations SET credentials_encrypted = $1 WHERE id = $2`, [stale, integration.id]);

    const callsBefore = httpCalls.filter((c) => c.url === 'https://oauth2.googleapis.com/token').length;
    const workerClient = new GoogleWorkerClient({ clientId: 'it-client-id', clientSecret: 'it-client-secret', fetchFn: mockGoogleFetch });
    const accessToken = await ensureValidAccessToken(query, { id: integration.id, credentialsEncrypted: stale }, workerClient);
    assert.strictEqual(accessToken, REFRESHED_ACCESS_TOKEN);
    const callsAfter = httpCalls.filter((c) => c.url === 'https://oauth2.googleapis.com/token').length;
    assert.strictEqual(callsAfter, callsBefore + 1, 'exactly one refresh call');

    const after = (await query(`SELECT credentials_encrypted as "credentialsEncrypted" FROM integrations WHERE id = $1`, [integration.id])).rows[0];
    const tokens = parseStoredTokens(after.credentialsEncrypted);
    assert.strictEqual(tokens?.accessToken, REFRESHED_ACCESS_TOKEN, 'refreshed bundle persisted');
    assert.strictEqual(tokens?.refreshToken, REFRESH_TOKEN, 'refresh token preserved across refresh');
    console.log('  ✓ refresh: expired token refreshed once via Google, new bundle persisted');
  }

  // ---------- Not-configured client gate ----------
  {
    const unconfigured = new GoogleWorkerClient({ clientId: '', clientSecret: '', fetchFn: mockGoogleFetch });
    assert.strictEqual(unconfigured.isConfigured(), false);
    console.log('  ✓ not-configured: worker client reports unconfigured without env credentials');
  }

  console.log('✅ Google OAuth integration tests passed');
} finally {
  if (orgId) {
    await query(`DELETE FROM organizations WHERE id = $1`, [orgId]).catch(() => {});
  }
  if (userId) {
    await query(`DELETE FROM users WHERE id = $1`, [userId]).catch(() => {});
  }
  await pool.end();
}
