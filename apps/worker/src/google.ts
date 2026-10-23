/**
 * RankForge — Worker Google integration (Search Console + GA4 sync)
 *
 * Real Google data import for the GSC_SYNC / GA4_SYNC job handlers in
 * index.ts: reads the project's integration row, decrypts the OAuth
 * token bundle stored by the API's connect flow, refreshes it when
 * stale, calls the Search Analytics / GA4 Data APIs and persists rows
 * into gsc_metrics / ga4_metrics.
 *
 * Why this lives in the worker: the worker is a self-contained app
 * (it already carries its own copies of the crawler, SSRF guard,
 * audit engine, DataForSEO and AI clients), and the API app's Google
 * module cannot be imported across the standalone worker build. This
 * module mirrors the API client's endpoints, parsing and — critically —
 * the AES-256-GCM token format of apps/api/src/lib/encryption.ts.
 * KEEP THE ENCRYPTION COPY IN SYNC with that file: both sides derive
 * the key from ENCRYPTION_KEY || JWT_SECRET, so the worker must run
 * with the same ENCRYPTION_KEY/JWT_SECRET as the API.
 *
 * No fake data: without a connected, property-bound integration the
 * handlers keep failing jobs with PROVIDER_NOT_CONFIGURED.
 */

import crypto from 'crypto';

// ============================================================
// ENCRYPTION — mirror of apps/api/src/lib/encryption.ts
// ============================================================

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'default-key-32-chars-min-required!!';
  return crypto.createHash('sha256').update(key).digest();
}

function encryptText(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decryptText(encryptedText: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error('Invalid encrypted format');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ============================================================
// TOKENS — same bundle shape as apps/api/src/lib/google.ts
// ============================================================

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  /** epoch milliseconds when the access token expires */
  expiresAt: number;
  scope?: string;
  tokenType?: string;
}

export class GoogleApiError extends Error {
  httpStatus?: number;
  providerError?: string;
  constructor(message: string, opts: { httpStatus?: number; providerError?: string } = {}) {
    super(message);
    this.name = 'GoogleApiError';
    this.httpStatus = opts.httpStatus;
    this.providerError = opts.providerError;
  }
}

export function parseTokenResponse(json: any, previous?: GoogleTokens | null, now: number = Date.now()): GoogleTokens {
  if (!json || typeof json !== 'object' || !json.access_token) {
    throw new GoogleApiError(
      `Google token response did not include an access_token${json?.error ? `: ${json.error}${json.error_description ? ` — ${json.error_description}` : ''}` : ''}`,
      { providerError: json?.error }
    );
  }
  const expiresInSec = typeof json.expires_in === 'number' ? json.expires_in : 3600;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || previous?.refreshToken,
    expiresAt: now + expiresInSec * 1000,
    scope: json.scope || previous?.scope,
    tokenType: json.token_type || 'Bearer',
  };
}

export function isAccessTokenFresh(tokens: GoogleTokens, now: number = Date.now(), skewMs: number = 60_000): boolean {
  return typeof tokens.expiresAt === 'number' && tokens.expiresAt - now > skewMs;
}

export function serializeTokens(tokens: GoogleTokens): Buffer {
  return Buffer.from(encryptText(JSON.stringify(tokens)), 'utf8');
}

export function parseStoredTokens(stored: Buffer | string | null | undefined): GoogleTokens | null {
  if (stored === null || stored === undefined) return null;
  const text = Buffer.isBuffer(stored) ? stored.toString('utf8') : String(stored);
  if (!text.trim()) return null;
  let json: string;
  try {
    json = decryptText(text);
  } catch {
    throw new GoogleApiError('Stored Google credentials could not be decrypted (worker ENCRYPTION_KEY/JWT_SECRET must match the API)');
  }
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed.accessToken !== 'string') {
    throw new GoogleApiError('Stored Google credentials are malformed');
  }
  return parsed as GoogleTokens;
}

// ============================================================
// CLIENT
// ============================================================

export type FetchFn = (url: string, init?: any) => Promise<any>;

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GSC_API_BASE = 'https://searchconsole.googleapis.com/webmasters/v3';
const GA4_DATA_API_BASE = 'https://analyticsdata.googleapis.com/v1beta';

export interface GoogleWorkerClientOptions {
  clientId: string;
  clientSecret: string;
  fetchFn?: FetchFn;
}

export class GoogleWorkerClient {
  private clientId: string;
  private clientSecret: string;
  private fetchFn: FetchFn;

  constructor(opts: GoogleWorkerClientOptions) {
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.fetchFn = opts.fetchFn || ((url: string, init?: any) => fetch(url, init));
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  async refreshAccessToken(tokens: GoogleTokens): Promise<GoogleTokens> {
    if (!tokens.refreshToken) {
      throw new GoogleApiError('Google connection has no refresh token — reconnect required', { providerError: 'no_refresh_token' });
    }
    const res = await this.fetchFn(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: tokens.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
      }).toString(),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new GoogleApiError(
        `Google token refresh failed (${res.status})${json?.error ? `: ${json.error}${json.error_description ? ` — ${json.error_description}` : ''}` : ''}`,
        { httpStatus: res.status, providerError: json?.error }
      );
    }
    return parseTokenResponse(json, tokens);
  }

  async querySearchAnalytics(accessToken: string, siteUrl: string, requestBody: any): Promise<any> {
    const url = `${GSC_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new GoogleApiError(
        `Search Console API request failed (${res.status})${json?.error?.message ? `: ${json.error.message}` : ''}`,
        { httpStatus: res.status, providerError: json?.error?.status }
      );
    }
    return json;
  }

  async runGa4Report(accessToken: string, propertyId: string, requestBody: any): Promise<any> {
    const url = `${GA4_DATA_API_BASE}/${propertyId}:runReport`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new GoogleApiError(
        `GA4 Data API request failed (${res.status})${json?.error?.message ? `: ${json.error.message}` : ''}`,
        { httpStatus: res.status, providerError: json?.error?.status }
      );
    }
    return json;
  }
}

// ============================================================
// DATE WINDOWS — GSC data lags ~2-3 days; GA4 ~1 day.
// Defaults: the 28 complete days ending at the lag boundary.
// ============================================================

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function defaultGscWindow(now: Date = new Date()): { startDate: string; endDate: string } {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 3);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
}

export function defaultGa4Window(now: Date = new Date()): { startDate: string; endDate: string } {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
}

// ============================================================
// REQUEST BUILDERS + RESPONSE MAPPERS (pure — unit-testable)
// ============================================================

export function buildGscRequestBody(window: { startDate: string; endDate: string }): any {
  return {
    startDate: window.startDate,
    endDate: window.endDate,
    dimensions: ['date', 'query', 'page', 'country', 'device'],
    rowLimit: 25000,
    dataState: 'final',
  };
}

export interface GscMetricRow {
  date: string;
  query: string | null;
  page: string | null;
  country: string | null;
  device: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export function mapGscSearchAnalyticsResponse(json: any): GscMetricRow[] {
  const rows = Array.isArray(json?.rows) ? json.rows : [];
  return rows
    .filter((r: any) => Array.isArray(r?.keys) && r.keys.length >= 5)
    .map((r: any) => ({
      date: String(r.keys[0]),
      query: r.keys[1] != null ? String(r.keys[1]) : null,
      page: r.keys[2] != null ? String(r.keys[2]) : null,
      country: r.keys[3] != null ? String(r.keys[3]) : null,
      device: r.keys[4] != null ? String(r.keys[4]) : null,
      clicks: Number(r.clicks) || 0,
      impressions: Number(r.impressions) || 0,
      ctr: Number(r.ctr) || 0,
      position: Number(r.position) || 0,
    }));
}

export function buildGa4RequestBody(window: { startDate: string; endDate: string }): any {
  return {
    dateRanges: [{ startDate: window.startDate, endDate: window.endDate }],
    dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'conversions' }, { name: 'screenPageViews' }],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
    limit: '100000',
  };
}

export interface Ga4MetricRow {
  date: string; // ISO yyyy-mm-dd
  channel: string;
  sessions: number;
  users: number;
  conversions: number;
  pageViews: number;
}

/** GA4 returns dates as yyyyMMdd — normalize to ISO for the DATE column. */
export function ga4DateToIso(value: string): string {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return value;
}

export function mapGa4ReportResponse(json: any): Ga4MetricRow[] {
  const rows = Array.isArray(json?.rows) ? json.rows : [];
  return rows
    .filter((r: any) => Array.isArray(r?.dimensionValues) && r.dimensionValues.length >= 2 && Array.isArray(r?.metricValues))
    .map((r: any) => ({
      date: ga4DateToIso(String(r.dimensionValues[0]?.value || '')),
      channel: String(r.dimensionValues[1]?.value || '(not set)'),
      sessions: Number(r.metricValues[0]?.value) || 0,
      users: Number(r.metricValues[1]?.value) || 0,
      conversions: Number(r.metricValues[2]?.value) || 0,
      pageViews: Number(r.metricValues[3]?.value) || 0,
    }));
}

// ============================================================
// PERSISTENCE — queryFn injected (same convention as dataforseo.ts)
// ============================================================

export type QueryFn = (text: string, params?: any[]) => Promise<any>;

export async function persistGscMetrics(
  queryFn: QueryFn,
  args: { organizationId: string; projectId: string; rows: GscMetricRow[] }
): Promise<{ imported: number }> {
  let imported = 0;
  for (const row of args.rows) {
    await queryFn(
      `INSERT INTO gsc_metrics (organization_id, project_id, date, clicks, impressions, ctr, position, query, page, country, device, provider, raw_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'gsc', $12)
       ON CONFLICT (project_id, date, query, page, country, device)
       DO UPDATE SET clicks = EXCLUDED.clicks, impressions = EXCLUDED.impressions,
                     ctr = EXCLUDED.ctr, position = EXCLUDED.position, raw_data = EXCLUDED.raw_data`,
      [
        args.organizationId, args.projectId, row.date, row.clicks, row.impressions, row.ctr, row.position,
        row.query, row.page, row.country, row.device, JSON.stringify(row),
      ]
    );
    imported++;
  }
  return { imported };
}

export async function persistGa4Metrics(
  queryFn: QueryFn,
  args: { organizationId: string; projectId: string; rows: Ga4MetricRow[] }
): Promise<{ imported: number }> {
  let imported = 0;
  for (const row of args.rows) {
    // organic_users is only meaningful on the Organic Search channel
    // row: it is that channel's user count. Other channels store 0 —
    // a derivation from the same response, not invented data.
    const organicUsers = row.channel === 'Organic Search' ? row.users : 0;
    await queryFn(
      `INSERT INTO ga4_metrics (organization_id, project_id, date, users, sessions, page_views, organic_users, conversions, channel, provider, raw_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ga4', $10)
       ON CONFLICT (project_id, date, channel)
       DO UPDATE SET users = EXCLUDED.users, sessions = EXCLUDED.sessions,
                     page_views = EXCLUDED.page_views, organic_users = EXCLUDED.organic_users,
                     conversions = EXCLUDED.conversions, raw_data = EXCLUDED.raw_data`,
      [
        args.organizationId, args.projectId, row.date, row.users, row.sessions, row.pageViews,
        organicUsers, row.conversions, row.channel, JSON.stringify(row),
      ]
    );
    imported++;
  }
  return { imported };
}

// ============================================================
// TOKEN LIFECYCLE for sync handlers
// ============================================================

/**
 * Returns a valid access token for an integration row, refreshing and
 * persisting the new bundle when the stored one is stale. Throws
 * GoogleApiError (providerError 'invalid_grant' / 'no_refresh_token'
 * when the grant is dead — callers mark the integration 'error').
 */
export async function ensureValidAccessToken(
  queryFn: QueryFn,
  integration: { id: string; credentialsEncrypted: Buffer | string | null },
  client: GoogleWorkerClient
): Promise<string> {
  const tokens = parseStoredTokens(integration.credentialsEncrypted);
  if (!tokens) {
    throw new GoogleApiError('Google integration has no stored credentials — reconnect required', { providerError: 'no_credentials' });
  }
  if (isAccessTokenFresh(tokens)) return tokens.accessToken;
  const refreshed = await client.refreshAccessToken(tokens);
  await queryFn(
    `UPDATE integrations SET credentials_encrypted = $1, last_error = NULL, updated_at = NOW() WHERE id = $2`,
    [serializeTokens(refreshed), integration.id]
  );
  return refreshed.accessToken;
}

export async function markIntegrationSyncSuccess(queryFn: QueryFn, integrationId: string): Promise<void> {
  await queryFn(
    `UPDATE integrations SET status = 'connected', last_sync_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1`,
    [integrationId]
  );
}

export async function markIntegrationError(queryFn: QueryFn, integrationId: string, message: string): Promise<void> {
  await queryFn(
    `UPDATE integrations SET status = 'error', last_error = $1, updated_at = NOW() WHERE id = $2`,
    [message.slice(0, 1000), integrationId]
  );
}
