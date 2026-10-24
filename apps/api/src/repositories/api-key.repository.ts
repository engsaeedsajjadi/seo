/**
 * RankForge — API Key Repository
 * Hash stored, raw key only returned once at creation
 */

import { query } from '../db/client.js';

export const apiKeyRepository = {
  async create(data: { organizationId: string; name: string; keyHash: string; keyPrefix: string; scopes?: string[]; expiresAt?: Date | null }): Promise<any> {
    const result = await query(
      `INSERT INTO api_keys (organization_id, name, key_hash, key_prefix, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, organization_id as "organizationId", name, key_prefix as "keyPrefix", scopes, expires_at as "expiresAt", created_at as "createdAt"`,
      [data.organizationId, data.name, data.keyHash, data.keyPrefix, data.scopes || ['read'], data.expiresAt || null]
    );
    return result.rows[0];
  },

  async findByHash(hash: string): Promise<any | null> {
    const result = await query(
      `SELECT id, organization_id as "organizationId", name, key_hash as "keyHash", key_prefix as "keyPrefix", scopes, expires_at as "expiresAt", revoked_at as "revokedAt", last_used_at as "lastUsedAt"
       FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL`,
      [hash]
    );
    const key = result.rows[0];
    if (!key) return null;
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) return null;
    return key;
  },

  async findByOrganization(organizationId: string): Promise<any[]> {
    const result = await query(
      `SELECT id, organization_id as "organizationId", name, key_prefix as "keyPrefix", scopes, last_used_at as "lastUsedAt", expires_at as "expiresAt", created_at as "createdAt"
       FROM api_keys WHERE organization_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC`,
      [organizationId]
    );
    return result.rows;
  },

  async updateLastUsed(id: string): Promise<void> {
    await query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [id]);
  },

  async revoke(id: string, organizationId: string): Promise<boolean> {
    const result = await query(
      'UPDATE api_keys SET revoked_at = NOW() WHERE id = $1 AND organization_id = $2 AND revoked_at IS NULL',
      [id, organizationId]
    );
    return (result.rowCount || 0) > 0;
  },
};
