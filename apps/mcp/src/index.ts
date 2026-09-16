/**
 * RankForge — MCP Server (Production)
 * Real PostgreSQL, tenant-isolated, no memoryDB
 */

import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { config } from '../../api/src/config/index.js';

const PORT = parseInt(process.env.MCP_PORT || '3002', 10);

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;
  const dbUrl = config.database.url;
  if (!dbUrl) throw new Error('DATABASE_URL required for MCP — FAIL FAST');
  pool = new Pool({
    connectionString: dbUrl,
    ssl: config.isProduction ? { rejectUnauthorized: false } : false,
    max: 10,
  });
  return pool;
}

async function query(text: string, params?: any[]) {
  const p = getPool();
  return p.query(text, params);
}

const app = express();

app.use(cors());
app.use(express.json());

interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (params: any, context: { organizationId: string; userId: string }) => Promise<any>;
}

const tools: MCPTool[] = [
  {
    name: 'list_projects',
    description: 'List all projects in the organization (tenant-isolated)',
    inputSchema: { type: 'object', properties: {} },
    handler: async (params, context) => {
      const result = await query(
        `SELECT id, name, domain, seo_score as "seoScore", last_crawl_at as "lastCrawlAt" FROM projects WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
        [context.organizationId]
      );
      return { projects: result.rows, count: result.rows.length };
    },
  },
  {
    name: 'get_project',
    description: 'Get details for a specific project (tenant-isolated)',
    inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] },
    handler: async (params, context) => {
      const result = await query(
        `SELECT id, name, domain, normalized_domain as "normalizedDomain", country, language, seo_score as "seoScore", last_crawl_at as "lastCrawlAt", created_at as "createdAt" FROM projects WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [params.projectId, context.organizationId]
      );
      if (result.rows.length === 0) throw new Error('Project not found or access denied — tenant isolation enforced');
      return { project: result.rows[0] };
    },
  },
  {
    name: 'get_audit_findings',
    description: 'Get SEO audit findings for a project (tenant-isolated)',
    inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'notice'] } } },
    handler: async (params, context) => {
      const projectCheck = await query('SELECT id FROM projects WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [params.projectId, context.organizationId]);
      if (projectCheck.rows.length === 0) throw new Error('Project not found or access denied');

      let sql = `SELECT id, rule_id as "ruleId", severity, category, title, description, affected_urls as "affectedUrls", recommendation, status, created_at as "createdAt" FROM audit_findings WHERE project_id = $1 AND organization_id = $2`;
      const queryParams: any[] = [params.projectId, context.organizationId];
      if (params.severity) {
        sql += ` AND severity = $3`;
        queryParams.push(params.severity);
      }
      sql += ` ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END LIMIT 100`;

      const result = await query(sql, queryParams);
      return { findings: result.rows, count: result.rows.length };
    },
  },
  {
    name: 'get_keywords',
    description: 'Get keywords for a project with search volume and difficulty (tenant-isolated)',
    inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] },
    handler: async (params, context) => {
      const projectCheck = await query('SELECT id FROM projects WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [params.projectId, context.organizationId]);
      if (projectCheck.rows.length === 0) throw new Error('Project not found or access denied');

      const result = await query(
        `SELECT id, keyword, normalized_keyword as "normalizedKeyword", country, language, search_volume as "searchVolume", difficulty, intent, provider FROM keywords WHERE project_id = $1 AND organization_id = $2 ORDER BY created_at DESC LIMIT 100`,
        [params.projectId, context.organizationId]
      );
      return { keywords: result.rows, count: result.rows.length };
    },
  },
  {
    name: 'get_rankings',
    description: 'Get keyword rankings for a project (tenant-isolated)',
    inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, keywordId: { type: 'string' } } },
    handler: async (params, context) => {
      const projectCheck = await query('SELECT id FROM projects WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [params.projectId, context.organizationId]);
      if (projectCheck.rows.length === 0) throw new Error('Project not found or access denied');

      let sql = `SELECT id, keyword_id as "keywordId", position, previous_position as "previousPosition", url, search_engine as "searchEngine", date FROM keyword_rankings WHERE project_id = $1 AND organization_id = $2`;
      const queryParams: any[] = [params.projectId, context.organizationId];
      if (params.keywordId) {
        sql += ` AND keyword_id = $3`;
        queryParams.push(params.keywordId);
      }
      sql += ` ORDER BY date DESC LIMIT 100`;

      const result = await query(sql, queryParams);
      return { rankings: result.rows, count: result.rows.length };
    },
  },
  {
    name: 'get_competitors',
    description: 'Get competitors for a project (tenant-isolated)',
    inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] },
    handler: async (params, context) => {
      const projectCheck = await query('SELECT id FROM projects WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [params.projectId, context.organizationId]);
      if (projectCheck.rows.length === 0) throw new Error('Project not found or access denied');

      const result = await query('SELECT id, domain, normalized_domain as "normalizedDomain", is_auto_discovered as "isAutoDiscovered" FROM competitors WHERE project_id = $1 AND organization_id = $2', [params.projectId, context.organizationId]);
      return { competitors: result.rows };
    },
  },
  {
    name: 'get_backlinks',
    description: 'Get backlinks for a project (tenant-isolated)',
    inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] },
    handler: async (params, context) => {
      const projectCheck = await query('SELECT id FROM projects WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [params.projectId, context.organizationId]);
      if (projectCheck.rows.length === 0) throw new Error('Project not found or access denied');

      const result = await query('SELECT id, source_domain as "sourceDomain", source_url as "sourceUrl", target_url as "targetUrl", anchor_text as "anchorText", domain_rating as "domainRating" FROM backlinks WHERE project_id = $1 AND organization_id = $2 ORDER BY last_seen DESC LIMIT 100', [params.projectId, context.organizationId]);
      return { backlinks: result.rows, count: result.rows.length };
    },
  },
  {
    name: 'run_crawl',
    description: 'Run a site crawl for a project (tenant-isolated, creates real job)',
    inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, maxPages: { type: 'number' } }, required: ['projectId'] },
    handler: async (params, context) => {
      const projectResult = await query('SELECT id, normalized_domain as "normalizedDomain" FROM projects WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [params.projectId, context.organizationId]);
      if (projectResult.rows.length === 0) throw new Error('Project not found or access denied');

      const project = projectResult.rows[0];

      const crawlRunResult = await query(
        `INSERT INTO crawl_runs (organization_id, project_id, status, config) VALUES ($1, $2, 'pending', $3) RETURNING id`,
        [context.organizationId, params.projectId, JSON.stringify({ maxPages: params.maxPages || 20 })]
      );
      const crawlRunId = crawlRunResult.rows[0].id;

      const jobResult = await query(
        `INSERT INTO jobs (organization_id, project_id, type, status, payload, attempts, max_attempts) VALUES ($1, $2, 'SITE_CRAWL', 'pending', $3, 0, 3) RETURNING id, status`,
        [context.organizationId, params.projectId, JSON.stringify({ domain: project.normalizedDomain, crawlRunId, maxPages: params.maxPages || 20 })]
      );

      return { jobId: jobResult.rows[0].id, crawlRunId, status: 'pending', message: 'Crawl job queued with real PostgreSQL persistence' };
    },
  },
  {
    name: 'generate_report',
    description: 'Generate a report for a project (tenant-isolated)',
    inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, type: { type: 'string' }, format: { type: 'string' } }, required: ['projectId', 'type'] },
    handler: async (params, context) => {
      const projectCheck = await query('SELECT id FROM projects WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [params.projectId, context.organizationId]);
      if (projectCheck.rows.length === 0) throw new Error('Project not found or access denied');

      const reportResult = await query(
        `INSERT INTO reports (organization_id, project_id, type, title, format, status) VALUES ($1, $2, $3, $4, $5, 'generating') RETURNING id, status`,
        [context.organizationId, params.projectId, params.type, `${params.type} report`, params.format || 'pdf']
      );

      return { reportId: reportResult.rows[0].id, status: 'generating', message: 'Report generation queued' };
    },
  },
  {
    name: 'get_provider_status',
    description: 'Get status of configured providers (DataForSEO, AI, Stripe, etc)',
    inputSchema: { type: 'object', properties: {} },
    handler: async (params, context) => {
      return {
        providers: {
          dataForSeo: config.providers.dataforseo.login ? 'configured' : 'not_configured',
          openai: config.providers.openai ? 'configured' : 'not_configured',
          anthropic: config.providers.anthropic ? 'configured' : 'not_configured',
          stripe: config.providers.stripe.secretKey ? 'configured' : 'not_configured',
          google: config.providers.google.clientId ? 'configured' : 'not_configured',
        },
        message: 'Not configured providers show explicit not_configured state, never fake data',
        organizationId: context.organizationId,
      };
    },
  },
];

app.get('/mcp/tools', (req, res) => {
  res.json({
    tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  });
});

app.post('/mcp/call', async (req, res) => {
  try {
    const { tool, params, organizationId, userId } = req.body;

    if (!organizationId || !userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'organizationId and userId required for tenant isolation' } });
    }

    // Verify membership
    try {
      const memberCheck = await query('SELECT id FROM organization_members WHERE organization_id = $1 AND user_id = $2', [organizationId, userId]);
      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not a member of this organization — tenant isolation enforced' } });
      }
    } catch (e) {
      console.error('[MCP] Membership check failed:', e);
      return res.status(503).json({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Database unavailable' } });
    }

    const toolDef = tools.find(t => t.name === tool);
    if (!toolDef) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Tool ${tool} not found` } });
    }

    const result = await toolDef.handler(params || {}, { organizationId, userId });

    res.json({ success: true, tool, result });
  } catch (error) {
    console.error('[MCP] Tool call failed:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error) } });
  }
});

app.get('/mcp/sse', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  res.write(`data: ${JSON.stringify({ type: 'tools', tools: tools.map(t => t.name) })}\n\n`);

  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() })}\n\n`);
  }, 30000);

  req.on('close', () => clearInterval(interval));
});

app.get('/health', async (req, res) => {
  try {
    const dbCheck = await query('SELECT 1');
    res.json({ status: 'healthy', tools: tools.length, database: 'healthy', timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ status: 'unhealthy', tools: tools.length, database: 'unhealthy', error: e instanceof Error ? e.message : String(e) });
  }
});

app.get('/ready', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ready: true, timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ ready: false, error: e instanceof Error ? e.message : String(e) });
  }
});

const server = app.listen(PORT, () => {
  console.log(`🤖 RankForge MCP Server running on port ${PORT}`);
  console.log(`🔧 Available tools: ${tools.map(t => t.name).join(', ')}`);
  console.log(`💾 Database: ${config.database.url ? 'PostgreSQL' : 'NOT CONFIGURED'}`);
  console.log(`🔒 Tenant isolation enforced on all tools`);
});

function gracefulShutdown(signal: string) {
  console.log(`${signal} received, shutting down MCP gracefully...`);
  server.close(async () => {
    if (pool) await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { tools };
