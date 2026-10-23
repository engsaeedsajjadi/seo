/**
 * RankForge — Google Integration Service
 *
 * Orchestrates the OAuth lifecycle on top of lib/google.ts (client)
 * and repositories/google-integration.repository.ts (storage):
 *   start → consent URL with signed state
 *   callback → code exchange, encrypted storage (org connection rows)
 *   token access → transparent refresh, persisted back to the row
 *   properties → GSC site list / GA4 property list, project binding
 *   disconnect → best-effort revoke + local wipe
 *
 * Honest states only: not configured (env missing), not connected
 * (no OAuth grant), connected. Nothing here fabricates Google data.
 */

import { ApiError } from '../middleware/auth.js';
import { config } from '../config/index.js';
import {
  GoogleApiError,
  GoogleClient,
  createGoogleClient,
  createOAuthState,
  verifyOAuthState,
  isAccessTokenFresh,
  parseStoredTokens,
  serializeTokens,
  GOOGLE_SCOPES,
  type GscSite,
  type Ga4Property,
} from '../lib/google.js';
import {
  googleIntegrationRepository,
  type GoogleProvider,
  type IntegrationRow,
} from '../repositories/google-integration.repository.js';

function requireConfigured(client: GoogleClient): void {
  if (!client.isConfigured()) {
    throw new ApiError(503, 'PROVIDER_NOT_CONFIGURED', 'Google OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
  }
}

function googleErrorToApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof GoogleApiError) {
    // invalid_grant on refresh means the grant is dead — the honest
    // product state is "not connected anymore", not a server error.
    if (error.providerError === 'invalid_grant' || error.providerError === 'no_refresh_token') {
      return new ApiError(409, 'GOOGLE_NOT_CONNECTED', `Google connection expired or revoked — reconnect required (${error.message})`);
    }
    return new ApiError(502, 'GOOGLE_API_ERROR', error.message);
  }
  return new ApiError(500, 'INTERNAL_ERROR', error instanceof Error ? error.message : String(error));
}

export interface GoogleConnectionStatus {
  configured: boolean;
  connected: boolean;
  /** raw integrations.status of the org connection row, when one exists */
  rowStatus?: string;
  email?: string;
  connectedAt?: string;
  scopes: string[];
}

export const googleService = {
  async getConnectionStatus(organizationId: string): Promise<GoogleConnectionStatus> {
    const client = createGoogleClient();
    const configured = client.isConfigured();
    if (!configured) return { configured, connected: false, scopes: GOOGLE_SCOPES };
    const row = await googleIntegrationRepository.getOrgConnection(organizationId, 'gsc');
    if (!row || row.status !== 'connected') {
      return { configured, connected: false, rowStatus: row?.status, scopes: GOOGLE_SCOPES };
    }
    return {
      configured,
      connected: true,
      rowStatus: row.status,
      email: row.config?.email,
      connectedAt: row.config?.connectedAt,
      scopes: GOOGLE_SCOPES,
    };
  },

  startOAuth(organizationId: string, userId: string): { url: string; scopes: string[] } {
    const client = createGoogleClient();
    requireConfigured(client);
    const state = createOAuthState({ organizationId, userId });
    return { url: client.buildConsentUrl(state), scopes: GOOGLE_SCOPES };
  },

  /**
   * Core of the OAuth callback. Kept separate from the HTTP route so
   * the full loop is integration-testable with a mocked Google client.
   * Returns the org the connection was stored for.
   */
  async handleOAuthCallback(
    code: string,
    state: string,
    client: GoogleClient = createGoogleClient()
  ): Promise<{ organizationId: string; userId: string; email?: string }> {
    requireConfigured(client);
    const payload = verifyOAuthState(state);
    if (!payload) {
      throw new ApiError(400, 'INVALID_STATE', 'OAuth state is invalid or expired — restart the Google connect flow');
    }
    let tokens;
    try {
      tokens = await client.exchangeCode(code);
    } catch (error) {
      throw googleErrorToApiError(error);
    }
    if (!tokens.refreshToken) {
      throw new ApiError(
        400,
        'NO_REFRESH_TOKEN',
        'Google did not return a refresh token — remove RankForge from your Google account permissions and reconnect'
      );
    }
    const email = await client.fetchUserEmail(tokens.accessToken).catch(() => undefined);
    const credentials = serializeTokens(tokens);
    const connectionConfig = {
      email,
      scopes: tokens.scope || GOOGLE_SCOPES.join(' '),
      connectedBy: payload.userId,
      connectedAt: new Date().toISOString(),
    };
    // One Google grant powers both products: store the same bundle on
    // the org-level 'gsc' and 'ga4' connection rows.
    for (const provider of ['gsc', 'ga4'] as GoogleProvider[]) {
      await googleIntegrationRepository.upsertOrgConnection(payload.organizationId, provider, credentials, connectionConfig);
    }
    return { organizationId: payload.organizationId, userId: payload.userId, email };
  },

  /**
   * Valid access token for an org's Google connection, refreshing and
   * persisting when the stored token is stale. Throws ApiError with
   * GOOGLE_NOT_CONNECTED when there is no usable grant.
   */
  async getValidAccessToken(organizationId: string, provider: GoogleProvider): Promise<string> {
    const client = createGoogleClient();
    requireConfigured(client);
    const row = await googleIntegrationRepository.getOrgConnection(organizationId, provider);
    if (!row || row.status !== 'connected' || !row.credentialsEncrypted) {
      throw new ApiError(409, 'GOOGLE_NOT_CONNECTED', 'Google account not connected — complete the OAuth connect flow first');
    }
    let tokens;
    try {
      tokens = parseStoredTokens(row.credentialsEncrypted);
    } catch (error) {
      throw googleErrorToApiError(error);
    }
    if (!tokens) {
      throw new ApiError(409, 'GOOGLE_NOT_CONNECTED', 'Google connection has no stored credentials — reconnect required');
    }
    if (isAccessTokenFresh(tokens)) return tokens.accessToken;
    try {
      const refreshed = await client.refreshAccessToken(tokens);
      const credentials = serializeTokens(refreshed);
      await googleIntegrationRepository.updateCredentials(row.id, credentials);
      await googleIntegrationRepository.propagateCredentials(organizationId, provider, credentials);
      return refreshed.accessToken;
    } catch (error) {
      const apiError = googleErrorToApiError(error);
      if (apiError.code === 'GOOGLE_NOT_CONNECTED') {
        await googleIntegrationRepository.markRowError(row.id, apiError.message);
      }
      throw apiError;
    }
  },

  async disconnect(organizationId: string): Promise<void> {
    const client = createGoogleClient();
    if (client.isConfigured()) {
      const row = await googleIntegrationRepository.getOrgConnection(organizationId, 'gsc');
      const tokens = row?.credentialsEncrypted ? parseStoredTokens(row.credentialsEncrypted) : null;
      if (tokens) {
        await client.revokeToken(tokens.refreshToken || tokens.accessToken);
      }
    }
    await googleIntegrationRepository.markOrgDisconnected(organizationId);
  },

  async listGscSites(organizationId: string): Promise<GscSite[]> {
    const accessToken = await this.getValidAccessToken(organizationId, 'gsc');
    try {
      return await createGoogleClient().listGscSites(accessToken);
    } catch (error) {
      throw googleErrorToApiError(error);
    }
  },

  async listGa4Properties(organizationId: string): Promise<Ga4Property[]> {
    const accessToken = await this.getValidAccessToken(organizationId, 'ga4');
    try {
      return await createGoogleClient().listGa4Properties(accessToken);
    } catch (error) {
      throw googleErrorToApiError(error);
    }
  },

  /**
   * Bind a chosen property to a project. The project row copies the
   * org token bundle (worker + per-project read paths use it) and its
   * config records the binding.
   */
  async bindProjectProperty(
    organizationId: string,
    projectId: string,
    provider: GoogleProvider,
    binding: { siteUrl?: string; propertyId?: string; propertyName?: string }
  ): Promise<IntegrationRow> {
    const orgRow = await googleIntegrationRepository.getOrgConnection(organizationId, provider);
    if (!orgRow || orgRow.status !== 'connected' || !orgRow.credentialsEncrypted) {
      throw new ApiError(409, 'GOOGLE_NOT_CONNECTED', 'Google account not connected — complete the OAuth connect flow first');
    }
    const bindingConfig =
      provider === 'gsc'
        ? { siteUrl: binding.siteUrl }
        : { propertyId: binding.propertyId, propertyName: binding.propertyName };
    return googleIntegrationRepository.upsertProjectBinding(
      organizationId,
      projectId,
      provider,
      orgRow.credentialsEncrypted,
      bindingConfig
    );
  },

  async unbindProject(organizationId: string, projectId: string, provider: GoogleProvider): Promise<void> {
    await googleIntegrationRepository.unbindProject(organizationId, projectId, provider);
  },
};
