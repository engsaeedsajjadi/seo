/**
 * RankForge — Job Repository
 * Real PostgreSQL persistence for background jobs
 */

import { query } from '../db/client.js';

export interface Job {
  id: string;
  organizationId: string;
  projectId?: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  payload: any;
  result?: any;
  error?: string;
  attempts: number;
  maxAttempts: number;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export const jobRepository = {
  async create(data: { organizationId: string; projectId?: string; type: string; payload?: any; maxAttempts?: number; scheduledAt?: Date }): Promise<Job> {
    const result = await query(
      `INSERT INTO jobs (organization_id, project_id, type, status, payload, attempts, max_attempts, scheduled_at)
       VALUES ($1, $2, $3, 'pending', $4, 0, $5, $6)
       RETURNING id, organization_id as "organizationId", project_id as "projectId", type, status, payload, result, error, attempts, max_attempts as "maxAttempts", scheduled_at as "scheduledAt", started_at as "startedAt", completed_at as "completedAt", created_at as "createdAt"`,
      [data.organizationId, data.projectId || null, data.type, JSON.stringify(data.payload || {}), data.maxAttempts || 3, data.scheduledAt || null]
    );
    return result.rows[0];
  },

  async findById(id: string, organizationId: string): Promise<Job | null> {
    const result = await query(
      `SELECT id, organization_id as "organizationId", project_id as "projectId", type, status, payload, result, error, attempts, max_attempts as "maxAttempts", scheduled_at as "scheduledAt", started_at as "startedAt", completed_at as "completedAt", created_at as "createdAt"
       FROM jobs WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );
    return result.rows[0] || null;
  },

  async findByOrganization(organizationId: string, options: { projectId?: string; status?: string; type?: string; limit?: number; offset?: number } = {}): Promise<{ items: Job[]; total: number }> {
    const limit = Math.min(options.limit || 20, 100);
    const offset = options.offset || 0;

    let where = 'WHERE organization_id = $1';
    const params: any[] = [organizationId];

    if (options.projectId) {
      params.push(options.projectId);
      where += ` AND project_id = $${params.length}`;
    }
    if (options.status) {
      params.push(options.status);
      where += ` AND status = $${params.length}`;
    }
    if (options.type) {
      params.push(options.type);
      where += ` AND type = $${params.length}`;
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM jobs ${where}`, params);
    const total = parseInt(countResult.rows[0].total, 10);

    const limitParam = params.length + 1;
    const offsetParam = params.length + 2;

    const result = await query(
      `SELECT id, organization_id as "organizationId", project_id as "projectId", type, status, payload, result, error, attempts, max_attempts as "maxAttempts", scheduled_at as "scheduledAt", started_at as "startedAt", completed_at as "completedAt", created_at as "createdAt"
       FROM jobs ${where}
       ORDER BY created_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...params, limit, offset]
    );

    return { items: result.rows, total };
  },

  async findPending(limit: number = 10): Promise<Job[]> {
    const result = await query(
      `SELECT id, organization_id as "organizationId", project_id as "projectId", type, status, payload, attempts, max_attempts as "maxAttempts", created_at as "createdAt"
       FROM jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1`,
      [limit]
    );
    return result.rows;
  },

  async updateStatus(id: string, organizationId: string, status: string, data: { result?: any; error?: string; startedAt?: Date; completedAt?: Date } = {}): Promise<Job | null> {
    const fields: string[] = ['status = $3'];
    const values: any[] = [id, organizationId, status];

    if (data.result !== undefined) {
      values.push(JSON.stringify(data.result));
      fields.push(`result = $${values.length}`);
    }
    if (data.error !== undefined) {
      values.push(data.error);
      fields.push(`error = $${values.length}`);
    }
    if (data.startedAt !== undefined) {
      values.push(data.startedAt);
      fields.push(`started_at = $${values.length}`);
    }
    if (data.completedAt !== undefined) {
      values.push(data.completedAt);
      fields.push(`completed_at = $${values.length}`);
    }

    if (status === 'running') {
      fields.push(`started_at = NOW()`, `attempts = attempts + 1`);
    }
    if (status === 'completed' || status === 'failed') {
      fields.push(`completed_at = NOW()`);
    }

    const result = await query(
      `UPDATE jobs SET ${fields.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING id, organization_id as "organizationId", project_id as "projectId", type, status, payload, result, error, attempts, max_attempts as "maxAttempts", created_at as "createdAt"`,
      values
    );
    return result.rows[0] || null;
  },
};
