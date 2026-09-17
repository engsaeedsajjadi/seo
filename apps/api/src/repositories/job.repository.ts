/**
 * RankForge — Job Repository — Production Reality
 * Real PostgreSQL persistence, atomic claiming with FOR UPDATE SKIP LOCKED, idempotency
 */

import { query } from '../db/client.js';

export interface Job {
  id: string;
  organizationId: string;
  projectId?: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying' | 'cancelled' | 'dead_letter';
  payload: any;
  result?: any;
  error?: string;
  errorCode?: string;
  attempts: number;
  maxAttempts: number;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  executionId?: string;
  idempotencyKey?: string;
  createdAt: Date;
}

export const jobRepository = {
  async create(data: { organizationId: string; projectId?: string; type: string; payload?: any; maxAttempts?: number; scheduledAt?: Date; idempotencyKey?: string }): Promise<Job> {
    const idempotencyKey = data.idempotencyKey || `${data.organizationId}_${data.type}_${Date.now()}_${Math.random().toString(36).substring(2,8)}`;
    
    const result = await query(
      `INSERT INTO jobs (organization_id, project_id, type, status, payload, attempts, max_attempts, scheduled_at, idempotency_key, execution_id)
       VALUES ($1, $2, $3, 'pending', $4, 0, $5, $6, $7, gen_random_uuid())
       ON CONFLICT (idempotency_key) DO UPDATE SET payload = EXCLUDED.payload
       RETURNING id, organization_id as "organizationId", project_id as "projectId", type, status, payload, result, error, error_code as "errorCode", attempts, max_attempts as "maxAttempts", scheduled_at as "scheduledAt", started_at as "startedAt", completed_at as "completedAt", failed_at as "failedAt", execution_id as "executionId", idempotency_key as "idempotencyKey", created_at as "createdAt"`,
      [data.organizationId, data.projectId || null, data.type, JSON.stringify(data.payload || {}), data.maxAttempts || 3, data.scheduledAt || null, idempotencyKey]
    );
    return result.rows[0];
  },

  async findById(id: string, organizationId: string): Promise<Job | null> {
    const result = await query(
      `SELECT id, organization_id as "organizationId", project_id as "projectId", type, status, payload, result, error, error_code as "errorCode", attempts, max_attempts as "maxAttempts", scheduled_at as "scheduledAt", started_at as "startedAt", completed_at as "completedAt", failed_at as "failedAt", execution_id as "executionId", idempotency_key as "idempotencyKey", created_at as "createdAt"
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
      `SELECT id, organization_id as "organizationId", project_id as "projectId", type, status, payload, result, error, error_code as "errorCode", attempts, max_attempts as "maxAttempts", scheduled_at as "scheduledAt", started_at as "startedAt", completed_at as "completedAt", failed_at as "failedAt", execution_id as "executionId", idempotency_key as "idempotencyKey", created_at as "createdAt"
       FROM jobs ${where}
       ORDER BY created_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...params, limit, offset]
    );

    return { items: result.rows, total };
  },

  // Atomic claiming with FOR UPDATE SKIP LOCKED — prevents duplicate execution
  async claimPendingJobs(limit: number = 10): Promise<Job[]> {
    const result = await query(
      `WITH claimed AS (
         SELECT id FROM jobs 
         WHERE status = 'pending' 
         AND (scheduled_at IS NULL OR scheduled_at <= NOW())
         ORDER BY created_at ASC 
         FOR UPDATE SKIP LOCKED 
         LIMIT $1
       )
       UPDATE jobs 
       SET status = 'running', 
           started_at = NOW(), 
           attempts = attempts + 1,
           execution_id = gen_random_uuid(),
           error = NULL,
           error_code = NULL
       WHERE id IN (SELECT id FROM claimed)
       RETURNING id, organization_id as "organizationId", project_id as "projectId", type, status, payload, attempts, max_attempts as "maxAttempts", created_at as "createdAt", idempotency_key as "idempotencyKey", execution_id as "executionId"`,
      [limit]
    );
    return result.rows;
  },

  async findPending(limit: number = 10): Promise<Job[]> {
    // Deprecated — use claimPendingJobs for atomic claiming
    // This method is kept for backward compatibility but does NOT provide atomic guarantee
    // It should not be used in production worker
    const result = await query(
      `SELECT id, organization_id as "organizationId", project_id as "projectId", type, status, payload, attempts, max_attempts as "maxAttempts", created_at as "createdAt", idempotency_key as "idempotencyKey", execution_id as "executionId"
       FROM jobs WHERE status = 'pending' AND (scheduled_at IS NULL OR scheduled_at <= NOW()) ORDER BY created_at ASC LIMIT $1`,
      [limit]
    );
    return result.rows;
  },

  async updateStatus(id: string, organizationId: string, status: string, data: { result?: any; error?: string; errorCode?: string; startedAt?: Date; completedAt?: Date; failedAt?: Date } = {}): Promise<Job | null> {
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
    if (data.errorCode !== undefined) {
      values.push(data.errorCode);
      fields.push(`error_code = $${values.length}`);
    }
    if (data.startedAt !== undefined) {
      values.push(data.startedAt);
      fields.push(`started_at = $${values.length}`);
    }
    if (data.completedAt !== undefined) {
      values.push(data.completedAt);
      fields.push(`completed_at = $${values.length}`);
    }
    if (data.failedAt !== undefined) {
      values.push(data.failedAt);
      fields.push(`failed_at = $${values.length}`);
    }

    if (status === 'running') {
      fields.push(`started_at = NOW()`, `attempts = attempts + 1`, `execution_id = gen_random_uuid()`);
    }
    if (status === 'completed') {
      fields.push(`completed_at = NOW()`, `failed_at = NULL`);
    }
    if (status === 'failed' || status === 'dead_letter') {
      fields.push(`completed_at = NOW()`, `failed_at = NOW()`);
    }

    const result = await query(
      `UPDATE jobs SET ${fields.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING id, organization_id as "organizationId", project_id as "projectId", type, status, payload, result, error, error_code as "errorCode", attempts, max_attempts as "maxAttempts", created_at as "createdAt", execution_id as "executionId", idempotency_key as "idempotencyKey"`,
      values
    );
    return result.rows[0] || null;
  },

  async markFailed(id: string, error: string, errorCode: string): Promise<void> {
    await query(
      `UPDATE jobs SET status = 'failed', error = $2, error_code = $3, failed_at = NOW(), completed_at = NOW() WHERE id = $1`,
      [id, error, errorCode]
    );
  },

  async markDeadLetter(id: string, error: string, errorCode: string): Promise<void> {
    await query(
      `UPDATE jobs SET status = 'dead_letter', error = $2, error_code = $3, failed_at = NOW(), completed_at = NOW() WHERE id = $1`,
      [id, error, errorCode]
    );
  },
};
