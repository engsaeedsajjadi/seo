/**
 * RankForge — Keyword Repository
 * Real PostgreSQL with tenant isolation
 */

import { query } from '../db/client.js';

export interface Keyword {
  id: string;
  organizationId: string;
  projectId: string;
  keyword: string;
  normalizedKeyword: string;
  country: string;
  language: string;
  searchVolume?: number | null;
  cpc?: number | null;
  competition?: number | null;
  difficulty?: number | null;
  intent?: string | null;
  provider?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const keywordRepository = {
  async findById(id: string, organizationId: string): Promise<Keyword | null> {
    const result = await query(
      `SELECT id, organization_id as "organizationId", project_id as "projectId", keyword, normalized_keyword as "normalizedKeyword",
              country, language, search_volume as "searchVolume", cpc, competition, difficulty, intent, provider,
              created_at as "createdAt", updated_at as "updatedAt"
       FROM keywords WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );
    return result.rows[0] || null;
  },

  async findByProject(projectId: string, organizationId: string, options: { page?: number; limit?: number; search?: string } = {}): Promise<{ items: Keyword[]; total: number }> {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 50, 100);
    const offset = (page - 1) * limit;

    let where = 'WHERE project_id = $1 AND organization_id = $2';
    const params: any[] = [projectId, organizationId];
    let idx = 3;

    if (options.search) {
      where += ` AND keyword ILIKE $${idx++}`;
      params.push(`%${options.search}%`);
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM keywords ${where}`, params);
    const total = parseInt(countResult.rows[0].total, 10);

    const result = await query(
      `SELECT id, organization_id as "organizationId", project_id as "projectId", keyword, normalized_keyword as "normalizedKeyword",
              country, language, search_volume as "searchVolume", cpc, competition, difficulty, intent, provider,
              created_at as "createdAt", updated_at as "updatedAt"
       FROM keywords ${where}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    return { items: result.rows, total };
  },

  async findByNormalized(projectId: string, organizationId: string, normalized: string, country: string): Promise<Keyword | null> {
    const result = await query(
      `SELECT id FROM keywords WHERE project_id = $1 AND organization_id = $2 AND normalized_keyword = $3 AND country = $4`,
      [projectId, organizationId, normalized, country]
    );
    return result.rows[0] || null;
  },

  async create(data: { organizationId: string; projectId: string; keyword: string; normalizedKeyword: string; country?: string; language?: string; searchVolume?: number | null; cpc?: number | null; competition?: number | null; difficulty?: number | null; intent?: string | null; provider?: string }): Promise<Keyword> {
    const result = await query(
      `INSERT INTO keywords (organization_id, project_id, keyword, normalized_keyword, country, language, search_volume, cpc, competition, difficulty, intent, provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, organization_id as "organizationId", project_id as "projectId", keyword, normalized_keyword as "normalizedKeyword",
                 country, language, search_volume as "searchVolume", cpc, competition, difficulty, intent, provider,
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [data.organizationId, data.projectId, data.keyword, data.normalizedKeyword, data.country || 'US', data.language || 'en', data.searchVolume || null, data.cpc || null, data.competition || null, data.difficulty || null, data.intent || null, data.provider || 'not_configured']
    );
    return result.rows[0];
  },

  async delete(id: string, organizationId: string): Promise<boolean> {
    const result = await query('DELETE FROM keywords WHERE id = $1 AND organization_id = $2', [id, organizationId]);
    return (result.rowCount || 0) > 0;
  },

  async countByOrganization(organizationId: string): Promise<number> {
    const result = await query('SELECT COUNT(*) as count FROM keywords WHERE organization_id = $1', [organizationId]);
    return parseInt(result.rows[0].count, 10);
  },
};
