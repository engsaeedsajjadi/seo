/**
 * RankForge — Google Integration Repository
 *
 * Persistence for Google OAuth connections and per-project property
 * bindings on top of the existing `integrations` table:
 *
 * - Connection (org level): one row per provider ('gsc' and 'ga4')
 *   with project_id NULL holding the encrypted token bundle and
 *   config { email, scopes, connectedBy, connectedAt }. A partial
 *   unique index (uq_integrations_org_provider) keeps these unique.
 * - Binding (project level): one row per (org, project, provider)
 *   whose config holds the bound property ({ siteUrl } for GSC,
 *   { propertyId, propertyName } for GA4) and whose
 *   credentials_encrypted carries a copy of the org token bundle, so
 *   the existing per-project read paths and the worker sync handlers
 *   keep their established lookup shape.
 *
 * Credentials are only ever handled as ciphertext Buffers produced by
 * lib/google.ts (serializeTokens) — never plaintext.
 */

import { query } from '../db/client.js';

export type GoogleProvider = 'gsc' | 'ga4';

export interface IntegrationRow {
  id: string;
  organizationId: string;
  projectId: string | null;
  provider: string;
  status: string;
  credentialsEncrypted: Buffer | null;
  config: any;
  lastSyncAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const SELECT = `SELECT id, organization_id as "organizationId", project_id as "projectId",
  provider, status, credentials_encrypted as "credentialsEncrypted", config,
  last_sync_at as "lastSyncAt", last_error as "lastError",
  created_at as "createdAt", updated_at as "updatedAt" FROM integrations`;

export const googleIntegrationRepository = {
  async getOrgConnection(organizationId: string, provider: GoogleProvider): Promise<IntegrationRow | null> {
    const result = await query(
      `${SELECT} WHERE organization_id = $1 AND provider = $2 AND project_id IS NULL`,
      [organizationId, provider]
    );
    return result.rows[0] || null;
  },

  async getProjectIntegration(organizationId: string, projectId: string, provider: GoogleProvider): Promise<IntegrationRow | null> {
    const result = await query(
      `${SELECT} WHERE organization_id = $1 AND project_id = $2 AND provider = $3`,
      [organizationId, projectId, provider]
    );
    return result.rows[0] || null;
  },

  /** Copy a fresh token bundle into every project binding row of a provider. */
  async propagateCredentials(organizationId: string, provider: GoogleProvider, credentialsEncrypted: Buffer): Promise<void> {
    await query(
      `UPDATE integrations SET credentials_encrypted = $1, updated_at = NOW()
       WHERE organization_id = $2 AND provider = $3 AND project_id IS NOT NULL AND status = 'connected'`,
      [credentialsEncrypted, organizationId, provider]
    );
  },

  /** Upsert the org-level connection row for a provider. */
  async upsertOrgConnection(
    organizationId: string,
    provider: GoogleProvider,
    credentialsEncrypted: Buffer,
    connectionConfig: Record<string, any>
  ): Promise<IntegrationRow> {
    await query(
      `INSERT INTO integrations (organization_id, project_id, provider, status, credentials_encrypted, config, last_error)
       VALUES ($1, NULL, $2, 'connected', $3, $4, NULL)
       ON CONFLICT (organization_id, provider) WHERE project_id IS NULL
       DO UPDATE SET status = 'connected', credentials_encrypted = EXCLUDED.credentials_encrypted,
                     config = EXCLUDED.config, last_error = NULL, updated_at = NOW()`,
      [organizationId, provider, credentialsEncrypted, JSON.stringify(connectionConfig)]
    );
    // Refresh token copies held by existing project bindings so a
    // reconnect (which may rotate the refresh token) never strands
    // already-bound projects on revoked credentials.
    await this.propagateCredentials(organizationId, provider, credentialsEncrypted);
    return (await this.getOrgConnection(organizationId, provider))!;
  },

  /** Upsert a per-project property binding row. */
  async upsertProjectBinding(
    organizationId: string,
    projectId: string,
    provider: GoogleProvider,
    credentialsEncrypted: Buffer,
    bindingConfig: Record<string, any>
  ): Promise<IntegrationRow> {
    await query(
      `INSERT INTO integrations (organization_id, project_id, provider, status, credentials_encrypted, config, last_error)
       VALUES ($1, $2, $3, 'connected', $4, $5, NULL)
       ON CONFLICT (organization_id, project_id, provider)
       DO UPDATE SET status = 'connected', credentials_encrypted = EXCLUDED.credentials_encrypted,
                     config = EXCLUDED.config, last_error = NULL, updated_at = NOW()`,
      [organizationId, projectId, provider, credentialsEncrypted, JSON.stringify(bindingConfig)]
    );
    return (await this.getProjectIntegration(organizationId, projectId, provider))!;
  },

  async updateCredentials(rowId: string, credentialsEncrypted: Buffer): Promise<void> {
    await query(
      `UPDATE integrations SET credentials_encrypted = $1, last_error = NULL, updated_at = NOW() WHERE id = $2`,
      [credentialsEncrypted, rowId]
    );
  },

  async markRowError(rowId: string, message: string): Promise<void> {
    await query(
      `UPDATE integrations SET status = 'error', last_error = $1, updated_at = NOW() WHERE id = $2`,
      [message.slice(0, 1000), rowId]
    );
  },

  /** Disconnect Google for the whole org: org rows + all project bindings. */
  async markOrgDisconnected(organizationId: string): Promise<void> {
    await query(
      `UPDATE integrations SET status = 'disconnected', credentials_encrypted = NULL, updated_at = NOW()
       WHERE organization_id = $1 AND provider IN ('gsc', 'ga4')`,
      [organizationId]
    );
  },

  /** Unbind one project: keeps the row (history of last sync), clears secrets + binding. */
  async unbindProject(organizationId: string, projectId: string, provider: GoogleProvider): Promise<void> {
    await query(
      `UPDATE integrations SET status = 'disconnected', credentials_encrypted = NULL, config = '{}', updated_at = NOW()
       WHERE organization_id = $1 AND project_id = $2 AND provider = $3`,
      [organizationId, projectId, provider]
    );
  },
};
