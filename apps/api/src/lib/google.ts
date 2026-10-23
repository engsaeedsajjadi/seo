/**
 * RankForge — Google OAuth + Search Console / GA4 client (API app)
 *
 * Implements the real Google integration the docs always claimed:
 * OAuth 2.0 consent (offline access), encrypted token storage,
 * refresh, property listing for Search Console and GA4.
 *
 * Token bundles are stored ONLY as AES-256-GCM ciphertext produced by
 * lib/encryption.ts (the codebase's existing utility) in
 * integrations.credentials_encrypted. Plaintext tokens are never
 * persisted and never logged.
 *
 * No fake data: without GOOGLE_CLIENT_ID/SECRET the client reports
 * "not configured"; without a completed OAuth connection, callers get
 * an explicit not-connected error.
 */

import crypto from 'crypto';
import { encrypt, decrypt } from './encryption.js';
import { config } from '../config/index.js';

export type FetchFn = (url: string, init?: any) => Promise<any>;

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

// ============================================================
// SCOPES — read-only Search Console + Analytics, plus identity
// (openid/email identify which Google account was connected)
// ============================================================

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
  'openid',
  'email',
];

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GSC_API_BASE = 'https://searchconsole.googleapis.com/webmasters/v3';
const GA4_ADMIN_API_BASE = 'https://analyticsadmin.googleapis.com/v1beta';

// ============================================================
// TOKEN BUNDLE — what gets encrypted into integrations rows
// ============================================================

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  /** epoch milliseconds when the access token expires */
  expiresAt: number;
  scope?: string;
  tokenType?: string;
}

/** Parse a Google token-endpoint response into a token bundle. */
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
    // Refresh responses usually omit refresh_token — keep the old one.
    refreshToken: json.refresh_token || previous?.refreshToken,
    expiresAt: now + expiresInSec * 1000,
    scope: json.scope || previous?.scope,
    tokenType: json.token_type || 'Bearer',
  };
}

export function isAccessTokenFresh(tokens: GoogleTokens, now: number = Date.now(), skewMs: number = 60_000): boolean {
  return typeof tokens.expiresAt === 'number' && tokens.expiresAt - now > skewMs;
}

/** Encrypt a token bundle for storage in integrations.credentials_encrypted (BYTEA). */
export function serializeTokens(tokens: GoogleTokens): Buffer {
  return Buffer.from(encrypt(JSON.stringify(tokens)), 'utf8');
}

/** Decrypt a stored bundle. Returns null when nothing is stored. */
export function parseStoredTokens(stored: Buffer | string | null | undefined): GoogleTokens | null {
  if (stored === null || stored === undefined) return null;
  const text = Buffer.isBuffer(stored) ? stored.toString('utf8') : String(stored);
  if (!text.trim()) return null;
  let json: string;
  try {
    json = decrypt(text);
  } catch {
    throw new GoogleApiError('Stored Google credentials could not be decrypted (ENCRYPTION_KEY/JWT_SECRET mismatch?)');
  }
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed.accessToken !== 'string') {
    throw new GoogleApiError('Stored Google credentials are malformed');
  }
  return parsed as GoogleTokens;
}

// ============================================================
// OAUTH STATE — HMAC-signed, short-lived, carries org + user so
// the browser callback (no Authorization header) stays CSRF-safe:
// an attacker cannot forge a state for a victim's organization.
// ============================================================

const STATE_TTL_MS = 10 * 60 * 1000;

function stateSecret(): string {
  return process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'default-key-32-chars-min-required!!';
}

export interface OAuthStatePayload {
  organizationId: string;
  userId: string;
}

export function createOAuthState(payload: OAuthStatePayload, now: number = Date.now()): string {
  const body = {
    org: payload.organizationId,
    user: payload.userId,
    nonce: crypto.randomBytes(16).toString('hex'),
    exp: now + STATE_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', stateSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyOAuthState(state: string, now: number = Date.now()): OAuthStatePayload | null {
  if (!state || typeof state !== 'string') return null;
  const [encoded, sig] = state.split('.');
  if (!encoded || !sig) return null;
  const expected = crypto.createHmac('sha256', stateSecret()).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const body = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!body.org || !body.user || typeof body.exp !== 'number' || body.exp < now) return null;
    return { organizationId: body.org, userId: body.user };
  } catch {
    return null;
  }
}

// ============================================================
// PROPERTY LIST PARSING (pure — unit-testable)
// ============================================================

export interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

export function parseGscSitesResponse(json: any): GscSite[] {
  const entries = Array.isArray(json?.siteEntry) ? json.siteEntry : [];
  return entries
    .filter((e: any) => e && typeof e.siteUrl === 'string')
    .map((e: any) => ({ siteUrl: e.siteUrl, permissionLevel: String(e.permissionLevel || '') }));
}

export interface Ga4Property {
  /** Full resource name, e.g. "properties/123456789" — used as the GA4 property id everywhere */
  propertyId: string;
  displayName: string;
  accountName: string;
}

export function parseGa4AccountSummaries(json: any): Ga4Property[] {
  const accounts = Array.isArray(json?.accountSummaries) ? json.accountSummaries : [];
  const out: Ga4Property[] = [];
  for (const account of accounts) {
    const summaries = Array.isArray(account?.propertySummaries) ? account.propertySummaries : [];
    for (const p of summaries) {
      if (p && typeof p.property === 'string') {
        out.push({
          propertyId: p.property,
          displayName: String(p.displayName || p.property),
          accountName: String(account?.displayName || account?.account || ''),
        });
      }
    }
  }
  return out;
}

// ============================================================
// CLIENT
// ============================================================

export interface GoogleClientOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchFn?: FetchFn;
}

export class GoogleClient {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private fetchFn: FetchFn;

  constructor(opts: GoogleClientOptions) {
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.redirectUri = opts.redirectUri;
    this.fetchFn = opts.fetchFn || ((url: string, init?: any) => fetch(url, init));
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  buildConsentUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      // offline + forced consent: guarantees a refresh_token on every
      // connect, including reconnects of a previously-authorized app.
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  private async tokenRequest(params: Record<string, string>, previous?: GoogleTokens | null): Promise<GoogleTokens> {
    const res = await this.fetchFn(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new GoogleApiError(
        `Google token request failed (${res.status})${json?.error ? `: ${json.error}${json.error_description ? ` — ${json.error_description}` : ''}` : ''}`,
        { httpStatus: res.status, providerError: json?.error }
      );
    }
    return parseTokenResponse(json, previous);
  }

  async exchangeCode(code: string): Promise<GoogleTokens> {
    return this.tokenRequest({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
    });
  }

  async refreshAccessToken(tokens: GoogleTokens): Promise<GoogleTokens> {
    if (!tokens.refreshToken) {
      throw new GoogleApiError('Google connection has no refresh token — reconnect required', { providerError: 'no_refresh_token' });
    }
    return this.tokenRequest(
      {
        refresh_token: tokens.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
      },
      tokens
    );
  }

  async fetchUserEmail(accessToken: string): Promise<string | undefined> {
    const res = await this.fetchFn(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return undefined; // identity is metadata — never fail the connect over it
    const json = await res.json().catch(() => null);
    return typeof json?.email === 'string' ? json.email : undefined;
  }

  async revokeToken(token: string): Promise<void> {
    // Best-effort: local disconnect must succeed even if Google is
    // unreachable or the token is already revoked.
    try {
      await this.fetchFn(GOOGLE_REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }).toString(),
      });
    } catch {
      /* intentionally ignored */
    }
  }

  private async apiGet(url: string, accessToken: string): Promise<any> {
    const res = await this.fetchFn(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new GoogleApiError(
        `Google API request failed (${res.status})${json?.error?.message ? `: ${json.error.message}` : ''}`,
        { httpStatus: res.status, providerError: json?.error?.status }
      );
    }
    return json;
  }

  async listGscSites(accessToken: string): Promise<GscSite[]> {
    const json = await this.apiGet(`${GSC_API_BASE}/sites`, accessToken);
    return parseGscSitesResponse(json);
  }

  async listGa4Properties(accessToken: string): Promise<Ga4Property[]> {
    const json = await this.apiGet(`${GA4_ADMIN_API_BASE}/accountSummaries`, accessToken);
    return parseGa4AccountSummaries(json);
  }
}

export function createGoogleClient(fetchFn?: FetchFn): GoogleClient {
  return new GoogleClient({
    clientId: config.providers.google.clientId,
    clientSecret: config.providers.google.clientSecret,
    redirectUri: config.providers.google.redirectUri,
    fetchFn,
  });
}
