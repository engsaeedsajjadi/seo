/**
 * RankForge — User Repository
 * Real PostgreSQL persistence, no memoryDB
 */

import { query } from '../db/client.js';

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  emailVerified: boolean;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export const userRepository = {
  async findByEmail(email: string): Promise<User | null> {
    const result = await query(
      'SELECT id, email, name, password_hash as "passwordHash", email_verified as "emailVerified", avatar_url as "avatarUrl", created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt" FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email.toLowerCase()]
    );
    return result.rows[0] || null;
  },

  async findById(id: string): Promise<User | null> {
    const result = await query(
      'SELECT id, email, name, password_hash as "passwordHash", email_verified as "emailVerified", avatar_url as "avatarUrl", created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt" FROM users WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    return result.rows[0] || null;
  },

  async create(data: { email: string; name: string; passwordHash: string }): Promise<User> {
    const result = await query(
      `INSERT INTO users (email, name, password_hash, email_verified)
       VALUES ($1, $2, $3, false)
       RETURNING id, email, name, password_hash as "passwordHash", email_verified as "emailVerified", avatar_url as "avatarUrl", created_at as "createdAt", updated_at as "updatedAt"`,
      [data.email.toLowerCase(), data.name, data.passwordHash]
    );
    return result.rows[0];
  },

  async update(id: string, data: Partial<{ name: string; emailVerified: boolean; avatarUrl: string }>): Promise<User | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.emailVerified !== undefined) {
      fields.push(`email_verified = $${idx++}`);
      values.push(data.emailVerified);
    }
    if (data.avatarUrl !== undefined) {
      fields.push(`avatar_url = $${idx++}`);
      values.push(data.avatarUrl);
    }

    if (fields.length === 0) return this.findById(id);

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL
       RETURNING id, email, name, password_hash as "passwordHash", email_verified as "emailVerified", avatar_url as "avatarUrl", created_at as "createdAt", updated_at as "updatedAt"`,
      values
    );
    return result.rows[0] || null;
  },

  async softDelete(id: string): Promise<void> {
    await query('UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
  },
};
