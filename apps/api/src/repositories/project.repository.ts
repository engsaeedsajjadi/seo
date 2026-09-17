/**
 * RankForge — Project Repository
 * Real PostgreSQL with tenant isolation enforced
 */

import { query } from '../db/client.js';

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  domain: string;
  normalizedDomain: string;
  country: string;
  language: string;
  timezone: string;
  device: string;
  searchEngines: string[];
  competitors: string[];
  seoScore?: number | null;
  lastCrawlAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}

export const projectRepository = {
  normalizeDomain,

  async findById(id: string, organizationId: string): Promise<Project | null> {
    // Tenant isolation: must match organization_id
    const result = await query(
      `SELECT id, organization_id as "organizationId", name, domain, normalized_domain as "normalizedDomain",
              country, language, timezone, device, search_engines as "searchEngines",
              competitors, seo_score as "seoScore", last_crawl_at as "lastCrawlAt",
              created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
       FROM projects 
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, organizationId]
    );
    return result.rows[0] || null;
  },

  async findByIdWithoutTenantCheck(id: string): Promise<Project | null> {
    // Only for internal use where tenant check done elsewhere
    const result = await query(
      `SELECT id, organization_id as "organizationId", name, domain, normalized_domain as "normalizedDomain",
              country, language, timezone, device, search_engines as "searchEngines",
              competitors, seo_score as "seoScore", last_crawl_at as "lastCrawlAt",
              created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
       FROM projects WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return result.rows[0] || null;
  },

  async findByOrganization(organizationId: string, options: { page?: number; limit?: number; search?: string } = {}): Promise<{ items: Project[]; total: number }> {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE p.organization_id = $1 AND p.deleted_at IS NULL';
    const params: any[] = [organizationId];
    let paramIdx = 2;

    if (options.search) {
      whereClause += ` AND (p.name ILIKE $${paramIdx} OR p.domain ILIKE $${paramIdx})`;
      params.push(`%${options.search}%`);
      paramIdx++;
    }

    const countResult = await query(
      `SELECT COUNT(*) as total FROM projects p ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const result = await query(
      `SELECT p.id, p.organization_id as "organizationId", p.name, p.domain, p.normalized_domain as "normalizedDomain",
              p.country, p.language, p.timezone, p.device, p.search_engines as "searchEngines",
              p.competitors, p.seo_score as "seoScore", p.last_crawl_at as "lastCrawlAt",
              p.created_at as "createdAt", p.updated_at as "updatedAt"
       FROM projects p
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    return { items: result.rows, total };
  },

  async findByDomain(organizationId: string, normalizedDomain: string): Promise<Project | null> {
    const result = await query(
      `SELECT id, organization_id as "organizationId", name, domain, normalized_domain as "normalizedDomain"
       FROM projects WHERE organization_id = $1 AND normalized_domain = $2 AND deleted_at IS NULL`,
      [organizationId, normalizedDomain]
    );
    return result.rows[0] || null;
  },

  async countByOrganization(organizationId: string): Promise<number> {
    const result = await query(
      'SELECT COUNT(*) as count FROM projects WHERE organization_id = $1 AND deleted_at IS NULL',
      [organizationId]
    );
    return parseInt(result.rows[0].count, 10);
  },

  async create(data: { organizationId: string; name: string; domain: string; country?: string; language?: string; timezone?: string; device?: string; searchEngines?: string[] }): Promise<Project> {
    const normalized = normalizeDomain(data.domain);

    const result = await query(
      `INSERT INTO projects (organization_id, name, domain, normalized_domain, country, language, timezone, device, search_engines)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, organization_id as "organizationId", name, domain, normalized_domain as "normalizedDomain",
                 country, language, timezone, device, search_engines as "searchEngines",
                 competitors, seo_score as "seoScore", last_crawl_at as "lastCrawlAt",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [
        data.organizationId,
        data.name,
        normalized,
        normalized,
        data.country || 'US',
        data.language || 'en',
        data.timezone || 'UTC',
        data.device || 'both',
        data.searchEngines || ['google'],
      ]
    );
    return result.rows[0];
  },

  async update(id: string, organizationId: string, data: Partial<{ name: string; country: string; language: string; timezone: string; device: string; searchEngines: string[]; competitors: string[]; seoScore: number; lastCrawlAt: Date }>): Promise<Project | null> {
    // Tenant isolation enforced
    const existing = await this.findById(id, organizationId);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.country !== undefined) {
      fields.push(`country = $${idx++}`);
      values.push(data.country);
    }
    if (data.language !== undefined) {
      fields.push(`language = $${idx++}`);
      values.push(data.language);
    }
    if (data.timezone !== undefined) {
      fields.push(`timezone = $${idx++}`);
      values.push(data.timezone);
    }
    if (data.device !== undefined) {
      fields.push(`device = $${idx++}`);
      values.push(data.device);
    }
    if (data.searchEngines !== undefined) {
      fields.push(`search_engines = $${idx++}`);
      values.push(data.searchEngines);
    }
    if (data.competitors !== undefined) {
      fields.push(`competitors = $${idx++}`);
      values.push(data.competitors);
    }
    if (data.seoScore !== undefined) {
      fields.push(`seo_score = $${idx++}`);
      values.push(data.seoScore);
    }
    if (data.lastCrawlAt !== undefined) {
      fields.push(`last_crawl_at = $${idx++}`);
      values.push(data.lastCrawlAt);
    }

    if (fields.length === 0) return existing;

    fields.push(`updated_at = NOW()`);
    values.push(id, organizationId);

    const result = await query(
      `UPDATE projects SET ${fields.join(', ')} 
       WHERE id = $${idx} AND organization_id = $${idx + 1} AND deleted_at IS NULL
       RETURNING id, organization_id as "organizationId", name, domain, normalized_domain as "normalizedDomain",
                 country, language, timezone, device, search_engines as "searchEngines",
                 competitors, seo_score as "seoScore", last_crawl_at as "lastCrawlAt",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      values
    );
    return result.rows[0] || null;
  },

  async softDelete(id: string, organizationId: string): Promise<boolean> {
    const result = await query(
      'UPDATE projects SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
      [id, organizationId]
    );
    return (result.rowCount || 0) > 0;
  },

  async restore(id: string, organizationId: string): Promise<boolean> {
    const result = await query(
      'UPDATE projects SET deleted_at = NULL, updated_at = NOW() WHERE id = $1 AND organization_id = $2 AND deleted_at IS NOT NULL',
      [id, organizationId]
    );
    return (result.rowCount || 0) > 0;
  },
};
