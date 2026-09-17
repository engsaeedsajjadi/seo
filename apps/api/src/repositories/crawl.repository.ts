/**
 * RankForge — Crawl Repository
 * Real PostgreSQL persistence for crawls, pages, issues
 */

import { query } from '../db/client.js';

export interface CrawlRun {
  id: string;
  organizationId: string;
  projectId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  totalPages: number;
  crawledPages: number;
  failedPages: number;
  config: any;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export const crawlRepository = {
  async create(data: { organizationId: string; projectId: string; config?: any }): Promise<CrawlRun> {
    const result = await query(
      `INSERT INTO crawl_runs (organization_id, project_id, status, config)
       VALUES ($1, $2, 'pending', $3)
       RETURNING id, organization_id as "organizationId", project_id as "projectId", status, total_pages as "totalPages", crawled_pages as "crawledPages", failed_pages as "failedPages", config, error, started_at as "startedAt", completed_at as "completedAt", created_at as "createdAt"`,
      [data.organizationId, data.projectId, JSON.stringify(data.config || {})]
    );
    return result.rows[0];
  },

  async findById(id: string, organizationId: string): Promise<CrawlRun | null> {
    const result = await query(
      `SELECT id, organization_id as "organizationId", project_id as "projectId", status, total_pages as "totalPages", crawled_pages as "crawledPages", failed_pages as "failedPages", config, error, started_at as "startedAt", completed_at as "completedAt", created_at as "createdAt"
       FROM crawl_runs WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );
    return result.rows[0] || null;
  },

  async findByProject(projectId: string, organizationId: string, limit = 20): Promise<CrawlRun[]> {
    const result = await query(
      `SELECT id, organization_id as "organizationId", project_id as "projectId", status, total_pages as "totalPages", crawled_pages as "crawledPages", failed_pages as "failedPages", config, started_at as "startedAt", completed_at as "completedAt", created_at as "createdAt"
       FROM crawl_runs WHERE project_id = $1 AND organization_id = $2 ORDER BY created_at DESC LIMIT $3`,
      [projectId, organizationId, limit]
    );
    return result.rows;
  },

  async updateStatus(id: string, organizationId: string, status: string, data: { totalPages?: number; crawledPages?: number; failedPages?: number; error?: string; startedAt?: Date; completedAt?: Date } = {}): Promise<CrawlRun | null> {
    const fields: string[] = ['status = $3'];
    const values: any[] = [id, organizationId, status];

    if (data.totalPages !== undefined) {
      values.push(data.totalPages);
      fields.push(`total_pages = $${values.length}`);
    }
    if (data.crawledPages !== undefined) {
      values.push(data.crawledPages);
      fields.push(`crawled_pages = $${values.length}`);
    }
    if (data.failedPages !== undefined) {
      values.push(data.failedPages);
      fields.push(`failed_pages = $${values.length}`);
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

    if (status === 'running') fields.push(`started_at = NOW()`);
    if (status === 'completed' || status === 'failed') fields.push(`completed_at = NOW()`);

    const result = await query(
      `UPDATE crawl_runs SET ${fields.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING id, organization_id as "organizationId", project_id as "projectId", status, total_pages as "totalPages", crawled_pages as "crawledPages", failed_pages as "failedPages", created_at as "createdAt"`,
      values
    );
    return result.rows[0] || null;
  },

  async savePage(crawlRunId: string, organizationId: string, projectId: string, page: any): Promise<void> {
    await query(
      `INSERT INTO crawl_pages (crawl_run_id, organization_id, project_id, url, normalized_url, status_code, content_type, title, meta_description, h1, word_count, response_time, is_indexable, canonical, robots_meta, structured_data, images, links, headers)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       ON CONFLICT (crawl_run_id, normalized_url) DO UPDATE SET
         status_code = EXCLUDED.status_code,
         title = EXCLUDED.title,
         meta_description = EXCLUDED.meta_description,
         word_count = EXCLUDED.word_count,
         response_time = EXCLUDED.response_time,
         is_indexable = EXCLUDED.is_indexable`,
      [
        crawlRunId,
        organizationId,
        projectId,
        page.url,
        page.normalizedUrl,
        page.statusCode,
        page.contentType,
        page.title,
        page.metaDescription,
        page.h1,
        page.wordCount,
        page.responseTime,
        page.isIndexable,
        page.canonical,
        page.robotsMeta,
        JSON.stringify(page.structuredData || []),
        JSON.stringify(page.images || []),
        JSON.stringify(page.links || []),
        JSON.stringify(page.headers || {}),
      ]
    );
  },

  async saveFinding(organizationId: string, projectId: string, crawlRunId: string, finding: any): Promise<void> {
    await query(
      `INSERT INTO audit_findings (organization_id, project_id, crawl_run_id, rule_id, severity, category, title, description, evidence, affected_urls, recommendation, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'open')
       ON CONFLICT DO NOTHING`,
      [
        organizationId,
        projectId,
        crawlRunId,
        finding.ruleId,
        finding.severity,
        finding.category,
        finding.title,
        finding.description,
        JSON.stringify(finding.evidence || {}),
        finding.affectedUrls || [],
        finding.recommendation,
      ]
    );
  },

  async getFindings(projectId: string, organizationId: string, filters: { severity?: string; category?: string; limit?: number; offset?: number } = {}): Promise<{ items: any[]; total: number }> {
    const limit = Math.min(filters.limit || 50, 100);
    const offset = filters.offset || 0;

    let where = 'WHERE project_id = $1 AND organization_id = $2';
    const params: any[] = [projectId, organizationId];
    let idx = 3;

    if (filters.severity) {
      where += ` AND severity = $${idx++}`;
      params.push(filters.severity);
    }
    if (filters.category) {
      where += ` AND category = $${idx++}`;
      params.push(filters.category);
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM audit_findings ${where}`, params);
    const total = parseInt(countResult.rows[0].total, 10);

    const result = await query(
      `SELECT id, organization_id as "organizationId", project_id as "projectId", rule_id as "ruleId", severity, category, title, description, evidence, affected_urls as "affectedUrls", recommendation, status, created_at as "createdAt"
       FROM audit_findings ${where}
       ORDER BY 
         CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,
         created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    return { items: result.rows, total };
  },
};
