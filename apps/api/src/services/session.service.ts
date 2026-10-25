import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { query, transaction } from '../db/client.js';
import { config } from '../config/index.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const sessionService = {
  accessToken(id: string, userId: string, organizationId: string, role: string, email: string) {
    return jwt.sign({ sid: id, userId, organizationId, role, email }, config.auth.jwtSecret,
      { expiresIn: '15m', issuer: 'rankforge', audience: 'rankforge-app', algorithm: 'HS256' });
  },
  async create(userId: string, organizationId: string, role: string, email: string) {
    return transaction(async () => {
      const id = randomUUID();
      const refreshToken = randomBytes(32).toString('hex');
      await query(`INSERT INTO auth_sessions (id,user_id,organization_id,expires_at)
        VALUES ($1,$2,$3,NOW() + INTERVAL '30 days')`, [id, userId, organizationId]);
      await query('INSERT INTO auth_refresh_tokens (token_hash,session_id) VALUES ($1,$2)', [hash(refreshToken), id]);
      return { token: this.accessToken(id, userId, organizationId, role, email), refreshToken };
    });
  },
  async refresh(refreshToken: string) {
    const result = await transaction(async () => {
      const found = await query(`SELECT s.id,s.user_id,s.organization_id,s.revoked_at,s.expires_at,t.consumed_at,
        u.email,m.role FROM auth_refresh_tokens t JOIN auth_sessions s ON s.id=t.session_id
        JOIN users u ON u.id=s.user_id AND u.deleted_at IS NULL
        JOIN organizations o ON o.id=s.organization_id AND o.deleted_at IS NULL
        JOIN organization_members m ON m.user_id=s.user_id AND m.organization_id=s.organization_id
        WHERE t.token_hash=$1 FOR UPDATE OF s,t`, [hash(refreshToken)]);
      const row = found.rows[0];
      if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) return null;
      if (row.consumed_at) {
        // Commit revocation even though the refresh fails (replay detection).
        await query('UPDATE auth_sessions SET revoked_at=NOW() WHERE id=$1', [row.id]);
        return null;
      }
      const next = randomBytes(32).toString('hex');
      await query('UPDATE auth_refresh_tokens SET consumed_at=NOW() WHERE token_hash=$1', [hash(refreshToken)]);
      await query('INSERT INTO auth_refresh_tokens (token_hash,session_id) VALUES ($1,$2)', [hash(next), row.id]);
      return { token: this.accessToken(row.id,row.user_id,row.organization_id,row.role,row.email), refreshToken: next };
    });
    if (!result) throw { status: 401, code: 'SESSION_EXPIRED', message: 'Session expired. Sign in again.' };
    return result;
  },
  async revoke(id: string) {
    await query('UPDATE auth_sessions SET revoked_at=NOW() WHERE id=$1', [id]);
  },
};
