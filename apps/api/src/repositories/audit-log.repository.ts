/**
 * RankForge — Audit Log Repository
 */

import { query } from '../db/client.js';

export const auditLogRepository = {
  async create(data: { organizationId: string; userId?: string; action: string; resourceType?: string; resourceId?: string; details?: any; ipAddress?: string; userAgent?: string }): Promise<any> {
    const result = await query(
      `INSERT INTO audit_logs (organization_id, user_id, action, resource_type, resource_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, organization_id as "organizationId", user_id as "userId", action, resource_type as "resourceType", resource_id as "resourceId", created_at as "createdAt"`,
      [data.organizationId, data.userId || null, data.action, data.resourceType || null, data.resourceId || null, JSON.stringify(data.details || {}), data.ipAddress || null, data.userAgent || null]
    );
    return result.rows[0];
  },

  async findByOrganization(organizationId: string, options: { page?: number; limit?: number; action?: string; userId?: string } = {}): Promise<{ items: any[]; total: number }> {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 50, 100);
    const offset = (page - 1) * limit;

    let where = 'WHERE organization_id = $1';
    const params: any[] = [organizationId];
    let idx = 2;

    if (options.action) {
      where += ` AND action = $${idx++}`;
      params.push(options.action);
    }
    if (options.userId) {
      where += ` AND user_id = $${idx++}`;
      params.push(options.userId);
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM audit_logs ${where}`, params);
    const total = parseInt(countResult.rows[0].total, 10);

    const result = await query(
      `SELECT id, organization_id as "organizationId", user_id as "userId", action, resource_type as "resourceType", resource_id as "resourceId", details, ip_address as "ipAddress", created_at as "createdAt"
       FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    return { items: result.rows, total };
  },
};
