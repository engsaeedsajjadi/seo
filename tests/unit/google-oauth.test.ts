/**
 * RankForge — Google OAuth (phase 4): unit tests
 *
 * Proves, with the HTTP layer mocked:
 *  - consent URL construction (client, redirect, scopes, offline access, state)
 *  - OAuth state signing: roundtrip, tamper rejection, expiry rejection
 *  - token response parsing (expiry math, refresh-token preservation)
 *  - token refresh request shape against Google's token endpoint
 *  - GSC site list + GA4 property list parsing (API lib)
 *  - GSC / GA4 sync row mapping from fixture API responses (worker module)
 *  - GA4 persistence writes channel-grained rows via the query function
 *  - stored-token roundtrip: API-side encryption decrypts in the worker copy
 */

import assert from 'assert';
import {
  GoogleClient,
  GoogleApiError,
  GOOGLE_SCOPES,
  createOAuthState,
  verifyOAuthState,
  parseTokenResponse,
  isAccessTokenFresh,
  serializeTokens,
  parseStoredTokens,
  parseGscSitesResponse,
  parseGa4AccountSummaries,
} from '../../apps/api/src/lib/google.js';
import {
  GoogleWorkerClient,
  buildGscRequestBody,
  buildGa4RequestBody,
  mapGscSearchAnalyticsResponse,
  mapGa4ReportResponse,
  persistGa4Metrics,
  parseStoredTokens as parseStoredTokensWorker,
  defaultGscWindow,
  defaultGa4Window,
  toIsoDate,
} from '../../apps/worker/src/google.js';

console.log('Testing Google OAuth + GSC/GA4 mapping (mocked HTTP)...');

// ---------- Consent URL ----------

{
  const client = new GoogleClient({ clientId: 'cid-123', clientSecret: 'secret', redirectUri: 'http://localhost:3001/api/v1/integrations/google/callback' });
  assert.strictEqual(client.isConfigured(), true);
  const url = new URL(client.buildConsentUrl('state-xyz'));
  assert.strictEqual(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.strictEqual(url.searchParams.get('client_id'), 'cid-123');
  assert.strictEqual(url.searchParams.get('redirect_uri'), 'http://localhost:3001/api/v1/integrations/google/callback');
  assert.strictEqual(url.searchParams.get('response_type'), 'code');
  assert.strictEqual(url.searchParams.get('access_type'), 'offline');
  assert.strictEqual(url.searchParams.get('prompt'), 'consent');
  assert.strictEqual(url.searchParams.get('state'), 'state-xyz');
  const scopes = (url.searchParams.get('scope') || '').split(' ');
  for (const required of GOOGLE_SCOPES) {
    assert.ok(scopes.includes(required), `scope missing: ${required}`);
  }
  assert.ok(scopes.includes('https://www.googleapis.com/auth/webmasters.readonly'));
  assert.ok(scopes.includes('https://www.googleapis.com/auth/analytics.readonly'));
  console.log('  ✓ consent URL: endpoint, client, redirect, offline access, scopes, state');
}

// ---------- OAuth state ----------

{
  const state = createOAuthState({ organizationId: 'org-1', userId: 'user-1' });
  const payload = verifyOAuthState(state);
  assert.deepStrictEqual(payload, { organizationId: 'org-1', userId: 'user-1' });

  // Tampered payload → rejected
  const [body, sig] = state.split('.');
  const forgedBody = Buffer.from(JSON.stringify({ org: 'org-EVIL', user: 'user-1', nonce: 'x', exp: Date.now() + 60000 })).toString('base64url');
  assert.strictEqual(verifyOAuthState(`${forgedBody}.${sig}`), null);
  // Tampered signature → rejected
  assert.strictEqual(verifyOAuthState(`${body}.${sig.slice(0, -2)}xx`), null);
  // Garbage → rejected
  assert.strictEqual(verifyOAuthState('not-a-state'), null);
  assert.strictEqual(verifyOAuthState(''), null);

  // Expired state → rejected (verify against a clock 11 minutes later)
  assert.strictEqual(verifyOAuthState(state, Date.now() + 11 * 60 * 1000), null);
  console.log('  ✓ oauth state: roundtrip, tamper rejected, expiry rejected');
}

// ---------- Token parsing ----------

{
  const now = 1_700_000_000_000;
  const tokens = parseTokenResponse(
    { access_token: 'ya29.new', refresh_token: '1//refresh', expires_in: 3600, scope: 's1 s2', token_type: 'Bearer' },
    null,
    now
  );
  assert.strictEqual(tokens.accessToken, 'ya29.new');
  assert.strictEqual(tokens.refreshToken, '1//refresh');
  assert.strictEqual(tokens.expiresAt, now + 3600 * 1000);
  assert.strictEqual(isAccessTokenFresh(tokens, now), true);
  assert.strictEqual(isAccessTokenFresh(tokens, now + 3600 * 1000 - 30_000), false, 'inside 60s skew → stale');

  // Refresh responses omit refresh_token → previous one is kept
  const refreshed = parseTokenResponse({ access_token: 'ya29.fresh', expires_in: 3600 }, tokens, now + 1000);
  assert.strictEqual(refreshed.accessToken, 'ya29.fresh');
  assert.strictEqual(refreshed.refreshToken, '1//refresh');

  // Error payloads throw with the provider error visible
  assert.throws(
    () => parseTokenResponse({ error: 'invalid_grant', error_description: 'Token has been revoked' }),
    (e: any) => e instanceof GoogleApiError && e.providerError === 'invalid_grant'
  );
  console.log('  ✓ token parsing: expiry math, refresh-token preservation, error surfacing');
}

// ---------- Refresh request shape (mocked HTTP) ----------

{
  const calls: any[] = [];
  const mockFetch = async (url: string, init?: any) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ access_token: 'ya29.refreshed', expires_in: 3599, token_type: 'Bearer' }) };
  };
  const workerClient = new GoogleWorkerClient({ clientId: 'cid', clientSecret: 'csecret', fetchFn: mockFetch });
  const out = await workerClient.refreshAccessToken({ accessToken: 'old', refreshToken: '1//r', expiresAt: 0 });
  assert.strictEqual(out.accessToken, 'ya29.refreshed');
  assert.strictEqual(out.refreshToken, '1//r');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, 'https://oauth2.googleapis.com/token');
  const body = new URLSearchParams(calls[0].init.body);
  assert.strictEqual(body.get('grant_type'), 'refresh_token');
  assert.strictEqual(body.get('refresh_token'), '1//r');
  assert.strictEqual(body.get('client_id'), 'cid');
  assert.strictEqual(body.get('client_secret'), 'csecret');

  // API-side client exchange: code grant shape
  const apiCalls: any[] = [];
  const apiClient = new GoogleClient({
    clientId: 'cid', clientSecret: 'csecret', redirectUri: 'http://localhost:3001/cb',
    fetchFn: async (url: string, init?: any) => {
      apiCalls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ access_token: 'ya29.ex', refresh_token: '1//ex', expires_in: 3600 }) };
    },
  });
  const exchanged = await apiClient.exchangeCode('auth-code-1');
  assert.strictEqual(exchanged.refreshToken, '1//ex');
  const exchangeBody = new URLSearchParams(apiCalls[0].init.body);
  assert.strictEqual(exchangeBody.get('grant_type'), 'authorization_code');
  assert.strictEqual(exchangeBody.get('code'), 'auth-code-1');
  assert.strictEqual(exchangeBody.get('redirect_uri'), 'http://localhost:3001/cb');
  console.log('  ✓ token endpoint calls: refresh grant + code exchange shapes');
}

// ---------- Property list parsing ----------

{
  const sites = parseGscSitesResponse({
    siteEntry: [
      { siteUrl: 'https://example.com/', permissionLevel: 'siteOwner' },
      { siteUrl: 'sc-domain:example.org', permissionLevel: 'siteFullUser' },
      { permissionLevel: 'siteOwner' }, // no siteUrl → dropped
    ],
  });
  assert.deepStrictEqual(sites, [
    { siteUrl: 'https://example.com/', permissionLevel: 'siteOwner' },
    { siteUrl: 'sc-domain:example.org', permissionLevel: 'siteFullUser' },
  ]);
  assert.deepStrictEqual(parseGscSitesResponse({}), []);
  assert.deepStrictEqual(parseGscSitesResponse(null), []);

  const props = parseGa4AccountSummaries({
    accountSummaries: [
      {
        account: 'accounts/111', displayName: 'Main Account',
        propertySummaries: [
          { property: 'properties/222', displayName: 'Example GA4' },
          { property: 'properties/333', displayName: 'Example App' },
        ],
      },
      { account: 'accounts/444', displayName: 'Empty Account', propertySummaries: [] },
    ],
  });
  assert.deepStrictEqual(props, [
    { propertyId: 'properties/222', displayName: 'Example GA4', accountName: 'Main Account' },
    { propertyId: 'properties/333', displayName: 'Example App', accountName: 'Main Account' },
  ]);
  console.log('  ✓ property parsing: GSC sites + GA4 account summaries');
}

// ---------- GSC sync mapping (worker) ----------

{
  const body = buildGscRequestBody({ startDate: '2026-09-22', endDate: '2026-10-19' });
  assert.deepStrictEqual(body.dimensions, ['date', 'query', 'page', 'country', 'device']);
  assert.strictEqual(body.startDate, '2026-09-22');

  const rows = mapGscSearchAnalyticsResponse({
    rows: [
      { keys: ['2026-10-19', 'example query', 'https://example.com/', 'usa', 'DESKTOP'], clicks: 12, impressions: 340, ctr: 0.0353, position: 4.2 },
      { keys: ['2026-10-19', 'example query', 'https://example.com/', 'irn', 'MOBILE'], clicks: 3, impressions: 90, ctr: 0.0333, position: 6.75 },
      { keys: ['2026-10-19'], clicks: 1 }, // malformed → dropped
    ],
    responseAggregationType: 'byProperty',
  });
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual(rows[0], {
    date: '2026-10-19', query: 'example query', page: 'https://example.com/', country: 'usa', device: 'DESKTOP',
    clicks: 12, impressions: 340, ctr: 0.0353, position: 4.2,
  });
  assert.strictEqual(rows[1].country, 'irn');
  console.log('  ✓ GSC mapping: dimension keys → metric rows, malformed dropped');
}

// ---------- GA4 sync mapping + persistence (worker) ----------

{
  const body = buildGa4RequestBody({ startDate: '2026-09-22', endDate: '2026-10-19' });
  assert.deepStrictEqual(body.dimensions.map((d: any) => d.name), ['date', 'sessionDefaultChannelGroup']);
  assert.deepStrictEqual(body.metrics.map((m: any) => m.name), ['sessions', 'totalUsers', 'conversions', 'screenPageViews']);

  const fixture = {
    dimensionHeaders: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
    metricHeaders: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'conversions' }, { name: 'screenPageViews' }],
    rows: [
      { dimensionValues: [{ value: '20261019' }, { value: 'Organic Search' }], metricValues: [{ value: '120' }, { value: '98' }, { value: '4' }, { value: '310' }] },
      { dimensionValues: [{ value: '20261019' }, { value: 'Direct' }], metricValues: [{ value: '55' }, { value: '50' }, { value: '1' }, { value: '140' }] },
    ],
    rowCount: 2,
  };
  const rows = mapGa4ReportResponse(fixture);
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual(rows[0], { date: '2026-10-19', channel: 'Organic Search', sessions: 120, users: 98, conversions: 4, pageViews: 310 });

  const writes: any[] = [];
  const recordingQuery = async (text: string, params?: any[]) => { writes.push({ text, params }); return { rows: [] }; };
  const stats = await persistGa4Metrics(recordingQuery, { organizationId: 'org-1', projectId: 'proj-1', rows });
  assert.strictEqual(stats.imported, 2);
  assert.ok(writes[0].text.includes('ON CONFLICT (project_id, date, channel)'));
  // organic_users: Organic Search row carries its users; Direct row stores 0
  assert.strictEqual(writes[0].params[6], 98);
  assert.strictEqual(writes[1].params[6], 0);
  assert.strictEqual(writes[0].params[8], 'Organic Search');
  console.log('  ✓ GA4 mapping: yyyyMMdd → ISO date, channel rows, organic_users derivation, upsert shape');
}

// ---------- Date windows ----------

{
  const now = new Date('2026-10-22T12:00:00Z');
  assert.deepStrictEqual(defaultGscWindow(now), { startDate: '2026-09-22', endDate: '2026-10-19' });
  assert.deepStrictEqual(defaultGa4Window(now), { startDate: '2026-09-24', endDate: '2026-10-21' });
  assert.strictEqual(toIsoDate(now), '2026-10-22');
  console.log('  ✓ sync windows: GSC ends 3 days back, GA4 1 day back, 28-day spans');
}

// ---------- Encrypted storage roundtrip across API → worker ----------

{
  const tokens = { accessToken: 'ya29.stored', refreshToken: '1//stored', expiresAt: Date.now() + 3600_000, scope: 's', tokenType: 'Bearer' };
  const stored = serializeTokens(tokens);
  assert.ok(Buffer.isBuffer(stored));
  assert.ok(!stored.toString('utf8').includes('ya29.stored'), 'ciphertext must not contain the plaintext access token');
  assert.ok(!stored.toString('utf8').includes('1//stored'), 'ciphertext must not contain the plaintext refresh token');
  // API side reads its own write
  assert.deepStrictEqual(parseStoredTokens(stored), tokens);
  // Worker side (independent copy of the format) reads the API's write
  assert.deepStrictEqual(parseStoredTokensWorker(stored), tokens);
  assert.strictEqual(parseStoredTokens(null), null);
  assert.strictEqual(parseStoredTokens(undefined), null);
  console.log('  ✓ encrypted storage: ciphertext holds no plaintext; API write decrypts in worker copy');
}

console.log('✅ Google OAuth unit tests passed');
