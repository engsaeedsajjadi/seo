/**
 * RankForge — Application Factory
 * Real PostgreSQL persistence, no memoryDB in production path
 * Separates app creation from server bootstrap
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from './config/index.js';
import { checkDatabaseHealth } from './db/client.js';
import { authMiddleware, AuthRequest, ApiError } from './middleware/auth.js';
import { healthRouter } from './routes/health.js';
import { organizationRepository } from './repositories/organization.repository.js';
import { projectRepository } from './repositories/project.repository.js';
import { jobRepository } from './repositories/job.repository.js';
import { keywordRepository } from './repositories/keyword.repository.js';
import { crawlRepository } from './repositories/crawl.repository.js';
import { creditRepository } from './repositories/credit.repository.js';
import { apiKeyRepository } from './repositories/api-key.repository.js';
import { auditLogRepository } from './repositories/audit-log.repository.js';
import { authService } from './services/auth.service.js';
import { generateApiKey } from './lib/encryption.js';

export function createApp() {
  const app = express();

  // ============================================================
  // MIDDLEWARE
  // ============================================================

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      
      if (config.isDevelopment) {
        if (origin.includes('.e2b.app') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
          return callback(null, true);
        }
      }

      if (config.corsOrigins.includes(origin) || config.corsOrigins.includes('*')) {
        return callback(null, true);
      }

      if (config.isProduction) {
        console.warn(`CORS blocked origin: ${origin}`);
        return callback(new Error(`Origin ${origin} not allowed by CORS`), false);
      }

      return callback(null, true);
    },
    credentials: true,
  }));

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: config.isProduction ? 200 : 1000,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many auth attempts, please try again later' } },
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Request ID and structured logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    (req as any).requestId = requestId;
    res.setHeader('X-Request-ID', requestId);

    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const log = {
        level: duration > 1000 ? 'warn' : 'info',
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: duration,
        userId: (req as any).userId || undefined,
        organizationId: (req as any).organizationId || undefined,
        ip: req.ip,
      };
      console.log(JSON.stringify(log));
    });
    next();
  });

  // ============================================================
  // VALIDATION SCHEMAS
  // ============================================================

  const signupSchema = z.object({
    email: z.string().email().max(255),
    password: z.string().min(8).max(128),
    name: z.string().min(1).max(100),
  });

  const loginSchema = z.object({
    email: z.string().email().max(255),
    password: z.string().min(1).max(128),
  });

  const projectSchema = z.object({
    name: z.string().min(1).max(255),
    domain: z.string().min(1).max(255),
    country: z.string().length(2).default('US'),
    language: z.string().length(2).default('en'),
    timezone: z.string().max(50).optional(),
    searchEngines: z.array(z.string()).optional(),
    device: z.enum(['desktop', 'mobile', 'both']).optional(),
  });

  const keywordSchema = z.object({
    keywords: z.array(z.string().min(1).max(500)).min(1).max(100),
    country: z.string().length(2).optional(),
    language: z.string().length(2).optional(),
    groupId: z.string().uuid().optional(),
  });

  const crawlSchema = z.object({
    maxPages: z.number().int().min(1).max(1000).optional(),
    maxDepth: z.number().int().min(1).max(10).optional(),
    concurrency: z.number().int().min(1).max(10).optional(),
    respectRobotsTxt: z.boolean().optional(),
  });

  const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(),
  });

  // ============================================================
  // HEALTH (no auth)
  // ============================================================

  app.use('/api/v1/health', healthRouter);

  app.get('/api/v1/ready', async (req, res) => {
    const dbHealth = await checkDatabaseHealth();
    const ready = dbHealth.healthy;
    res.status(ready ? 200 : 503).json({
      ready,
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealth.healthy ? 'healthy' : 'unhealthy',
        databaseLatencyMs: dbHealth.latencyMs,
        databaseError: dbHealth.error,
        redis: config.redis.url ? 'configured' : 'not_configured',
      },
    });
  });

  app.get('/api/v1/version', (req, res) => {
    res.json({
      version: process.env.npm_package_version || '1.0.0',
      environment: config.nodeEnv,
      timestamp: new Date().toISOString(),
    });
  });

  // ============================================================
  // AUTH ROUTES
  // ============================================================

  app.post('/api/v1/auth/signup', authLimiter, async (req, res, next) => {
    try {
      const { email, password, name } = signupSchema.parse(req.body);
      const result = await authService.signup(email, password, name, req.ip, req.headers['user-agent']);
      res.status(201).json({
        success: true,
        data: {
          user: { id: result.user.id, email: result.user.email, name: result.user.name, organizationId: result.organization.id },
          organization: result.organization,
          token: result.token,
        },
      });
    } catch (error: any) {
      if (error.status) {
        return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
      }
      next(error);
    }
  });

  app.post('/api/v1/auth/login', authLimiter, async (req, res, next) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const result = await authService.login(email, password, req.ip, req.headers['user-agent']);
      res.json({
        success: true,
        data: {
          user: { id: result.user.id, email: result.user.email, name: result.user.name, organizationId: result.organization.id },
          organization: result.organization,
          token: result.token,
        },
      });
    } catch (error: any) {
      if (error.status) {
        return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
      }
      next(error);
    }
  });

  app.get('/api/v1/auth/me', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const data = await authService.getCurrentUser(req.userId!);
      if (!data) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
      }
      res.json({
        success: true,
        data: {
          user: { id: data.user.id, email: data.user.email, name: data.user.name, organizationId: data.organizationId },
          organizations: data.organizations,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/auth/logout', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      await auditLogRepository.create({
        organizationId: req.organizationId!,
        userId: req.userId,
        action: 'user.logout',
        resourceType: 'user',
        resourceId: req.userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.json({ success: true, data: null });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================
  // ORGANIZATIONS
  // ============================================================

  app.get('/api/v1/organizations/current', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const org = await organizationRepository.findById(req.organizationId!);
      if (!org) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Organization not found' } });
      }
      res.json({ success: true, data: org });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/organizations', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const orgs = await organizationRepository.findByUserId(req.userId!);
      res.json({ success: true, data: orgs });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/v1/organizations/current', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const org = await organizationRepository.update(req.organizationId!, {
        name: req.body.name,
        settings: req.body.settings,
        whiteLabel: req.body.whiteLabel,
      });

      if (!org) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Organization not found' } });
      }

      await auditLogRepository.create({
        organizationId: req.organizationId!,
        userId: req.userId,
        action: 'organization.update',
        resourceType: 'organization',
        resourceId: org.id,
        details: { fields: Object.keys(req.body) },
        ipAddress: req.ip,
      });

      res.json({ success: true, data: org });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/organizations/current/members', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const members = await organizationRepository.getMembers(req.organizationId!);
      res.json({ success: true, data: members });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================
  // PROJECTS
  // ============================================================

  app.get('/api/v1/projects', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const { page, limit, search } = paginationSchema.parse(req.query);
      const result = await projectRepository.findByOrganization(req.organizationId!, { page, limit, search });

      res.json({
        success: true,
        data: result.items,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/projects/:id', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const project = await projectRepository.findById(req.params.id, req.organizationId!);
      if (!project) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      }
      res.json({ success: true, data: project });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/projects', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const parsed = projectSchema.parse(req.body);
      const normalizedDomain = projectRepository.normalizeDomain(parsed.domain);

      const lowerDomain = normalizedDomain.toLowerCase();
      if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(lowerDomain) || lowerDomain.endsWith('.internal') || lowerDomain.endsWith('.local')) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid domain: private/internal domains not allowed' } });
      }

      const org = await organizationRepository.findById(req.organizationId!);
      const count = await projectRepository.countByOrganization(req.organizationId!);
      const planLimits: Record<string, number> = { FREE: 1, STARTER: 3, PRO: 10, AGENCY: 50, ENTERPRISE: 200 };
      const limit = planLimits[org?.plan || 'FREE'] || 1;
      if (count >= limit) {
        return res.status(403).json({ success: false, error: { code: 'LIMIT_REACHED', message: `Project limit reached for ${org?.plan} plan (${limit}). Upgrade to create more.` } });
      }

      const existing = await projectRepository.findByDomain(req.organizationId!, normalizedDomain);
      if (existing) {
        return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Project with this domain already exists' } });
      }

      const project = await projectRepository.create({
        organizationId: req.organizationId!,
        name: parsed.name,
        domain: normalizedDomain,
        country: parsed.country,
        language: parsed.language,
        timezone: parsed.timezone,
        device: parsed.device,
        searchEngines: parsed.searchEngines,
      });

      await auditLogRepository.create({
        organizationId: req.organizationId!,
        userId: req.userId,
        action: 'project.create',
        resourceType: 'project',
        resourceId: project.id,
        details: { domain: normalizedDomain },
        ipAddress: req.ip,
      });

      await jobRepository.create({
        organizationId: req.organizationId!,
        projectId: project.id,
        type: 'SITE_CRAWL',
        payload: { domain: normalizedDomain, maxPages: 50 },
      });

      res.status(201).json({ success: true, data: project });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') } });
      }
      next(error);
    }
  });

  app.patch('/api/v1/projects/:id', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const project = await projectRepository.update(req.params.id, req.organizationId!, {
        name: req.body.name,
        country: req.body.country,
        language: req.body.language,
        timezone: req.body.timezone,
        device: req.body.device,
        searchEngines: req.body.searchEngines,
        competitors: req.body.competitors,
      });

      if (!project) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      }

      await auditLogRepository.create({
        organizationId: req.organizationId!,
        userId: req.userId,
        action: 'project.update',
        resourceType: 'project',
        resourceId: project.id,
        details: { fields: Object.keys(req.body) },
        ipAddress: req.ip,
      });

      res.json({ success: true, data: project });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/v1/projects/:id', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const deleted = await projectRepository.softDelete(req.params.id, req.organizationId!);
      if (!deleted) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      }

      await auditLogRepository.create({
        organizationId: req.organizationId!,
        userId: req.userId,
        action: 'project.delete',
        resourceType: 'project',
        resourceId: req.params.id,
        ipAddress: req.ip,
      });

      res.json({ success: true, data: null });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================
  // CRAWL & AUDIT
  // ============================================================

  app.post('/api/v1/projects/:projectId/crawl', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.organizationId!);
      if (!project) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      }

      const options = crawlSchema.parse(req.body || {});

      const wallet = await creditRepository.getWallet(req.organizationId!);
      if (wallet && wallet.balance < 10) {
        return res.status(402).json({ success: false, error: { code: 'INSUFFICIENT_CREDITS', message: 'Insufficient credits for crawl' } });
      }

      const crawlRun = await crawlRepository.create({
        organizationId: req.organizationId!,
        projectId: project.id,
        config: options,
      });

      const job = await jobRepository.create({
        organizationId: req.organizationId!,
        projectId: project.id,
        type: 'SITE_CRAWL',
        payload: { domain: project.normalizedDomain, crawlRunId: crawlRun.id, ...options },
      });

      await auditLogRepository.create({
        organizationId: req.organizationId!,
        userId: req.userId,
        action: 'crawl.start',
        resourceType: 'project',
        resourceId: project.id,
        details: { crawlRunId: crawlRun.id, jobId: job.id, ...options },
        ipAddress: req.ip,
      });

      res.status(201).json({ success: true, data: { job, crawlRun } });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') } });
      }
      next(error);
    }
  });

  app.get('/api/v1/projects/:projectId/crawls', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.organizationId!);
      if (!project) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      }

      const crawls = await crawlRepository.findByProject(project.id, req.organizationId!);
      res.json({ success: true, data: crawls });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/projects/:projectId/audit/findings', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.organizationId!);
      if (!project) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      }

      const { page, limit } = paginationSchema.parse(req.query);
      const severity = req.query.severity as string | undefined;
      const category = req.query.category as string | undefined;

      const result = await crawlRepository.getFindings(project.id, req.organizationId!, {
        severity,
        category,
        limit,
        offset: (page - 1) * limit,
      });

      res.json({
        success: true,
        data: result.items,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/projects/:projectId/audit/score', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.organizationId!);
      if (!project) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      }

      const result = await crawlRepository.getFindings(project.id, req.organizationId!, { limit: 1000 });

      let score = 100;
      const deductions: Record<string, number> = { critical: 10, high: 5, medium: 2, low: 1, notice: 0 };
      const breakdown: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, notice: 0 };

      result.items.forEach((f: any) => {
        const deduction = (deductions[f.severity] || 0) * Math.min(f.affectedUrls?.length || 1, 5);
        score -= deduction;
        breakdown[f.severity] = (breakdown[f.severity] || 0) + 1;
      });

      score = Math.max(0, Math.min(100, score));

      res.json({
        success: true,
        data: {
          overall: Math.round(score),
          findingsCount: result.total,
          projectSeoScore: project.seoScore,
          lastCrawlAt: project.lastCrawlAt,
          breakdown,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================
  // KEYWORDS
  // ============================================================

  app.get('/api/v1/projects/:projectId/keywords', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.organizationId!);
      if (!project) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      }

      const { page, limit, search } = paginationSchema.parse(req.query);
      const result = await keywordRepository.findByProject(project.id, req.organizationId!, { page, limit, search });

      res.json({
        success: true,
        data: result.items,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/projects/:projectId/keywords', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.organizationId!);
      if (!project) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      }

      const parsed = keywordSchema.parse(req.body);

      const count = await keywordRepository.countByOrganization(req.organizationId!);
      const org = await organizationRepository.findById(req.organizationId!);
      const planLimits: Record<string, number> = { FREE: 10, STARTER: 100, PRO: 500, AGENCY: 2500, ENTERPRISE: 10000 };
      const limit = planLimits[org?.plan || 'FREE'] || 10;
      if (count + parsed.keywords.length > limit) {
        return res.status(403).json({ success: false, error: { code: 'LIMIT_REACHED', message: `Keyword limit reached for ${org?.plan} plan (${limit})` } });
      }

      const hasProvider = !!(config.providers.dataforseo.login && config.providers.dataforseo.password) || !!config.providers.serpapi;
      const keywords = [];

      for (const kw of parsed.keywords) {
        const normalized = kw.toLowerCase().trim();
        const existing = await keywordRepository.findByNormalized(project.id, req.organizationId!, normalized, parsed.country || 'US');
        if (existing) continue;

        let enrichedData: any = {};

        if (hasProvider) {
          try {
            const { createSearchProvider } = await import('./lib/providers.js');
            const provider = createSearchProvider();
            if (provider.isConfigured()) {
              const results = await provider.getKeywords([kw], { country: parsed.country, language: parsed.language });
              if (results.length > 0) enrichedData = results[0];
            }
          } catch (e) {
            console.warn('[Keywords] Enrichment failed:', e);
          }
        }

        const keyword = await keywordRepository.create({
          organizationId: req.organizationId!,
          projectId: project.id,
          keyword: kw,
          normalizedKeyword: normalized,
          country: parsed.country,
          language: parsed.language,
          searchVolume: enrichedData.searchVolume || null,
          cpc: enrichedData.cpc || null,
          competition: enrichedData.competition || null,
          difficulty: enrichedData.difficulty || null,
          intent: enrichedData.intent || null,
          provider: enrichedData.provider || (hasProvider ? 'dataforseo' : 'not_configured'),
        });
        keywords.push(keyword);
      }

      await auditLogRepository.create({
        organizationId: req.organizationId!,
        userId: req.userId,
        action: 'keywords.add',
        resourceType: 'project',
        resourceId: project.id,
        details: { count: keywords.length },
        ipAddress: req.ip,
      });

      res.status(201).json({ success: true, data: keywords });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') } });
      }
      next(error);
    }
  });

  app.delete('/api/v1/projects/:projectId/keywords/:keywordId', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const deleted = await keywordRepository.delete(req.params.keywordId, req.organizationId!);
      if (!deleted) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Keyword not found' } });
      }
      res.json({ success: true, data: null });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================
  // JOBS
  // ============================================================

  app.get('/api/v1/projects/:projectId/jobs', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.organizationId!);
      if (!project) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      }

      const { page, limit } = paginationSchema.parse(req.query);
      const result = await jobRepository.findByOrganization(req.organizationId!, {
        projectId: project.id,
        limit,
        offset: (page - 1) * limit,
      });

      res.json({
        success: true,
        data: result.items,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/jobs', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const { page, limit } = paginationSchema.parse(req.query);
      const result = await jobRepository.findByOrganization(req.organizationId!, {
        limit,
        offset: (page - 1) * limit,
      });
      res.json({
        success: true,
        data: result.items,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================
  // BILLING & CREDITS
  // ============================================================

  app.get('/api/v1/billing/plans', (req, res) => {
    res.json({
      success: true,
      data: [
        { id: 'FREE', name: 'Free', priceMonthly: 0, priceAnnual: 0, limits: { projects: 1, keywords: 10 } },
        { id: 'STARTER', name: 'Starter', priceMonthly: 29, priceAnnual: 290, limits: { projects: 3, keywords: 100 } },
        { id: 'PRO', name: 'Professional', priceMonthly: 79, priceAnnual: 790, limits: { projects: 10, keywords: 500 } },
        { id: 'AGENCY', name: 'Agency', priceMonthly: 199, priceAnnual: 1990, limits: { projects: 50, keywords: 2500 } },
        { id: 'ENTERPRISE', name: 'Enterprise', priceMonthly: 499, priceAnnual: 4990, limits: { projects: 200, keywords: 10000 } },
      ],
    });
  });

  app.get('/api/v1/billing/subscription', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const org = await organizationRepository.findById(req.organizationId!);
      res.json({
        success: true,
        data: {
          plan: org?.plan || 'FREE',
          status: org?.subscriptionStatus || 'active',
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/billing/credits', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const wallet = await creditRepository.getWallet(req.organizationId!);
      res.json({ success: true, data: wallet || { balance: 0, totalGranted: 0, totalConsumed: 0 } });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/billing/usage', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const transactions = await creditRepository.getTransactions(req.organizationId!);
      res.json({ success: true, data: transactions });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================
  // API KEYS
  // ============================================================

  app.get('/api/v1/api-keys', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const keys = await apiKeyRepository.findByOrganization(req.organizationId!);
      res.json({ success: true, data: keys });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/api-keys', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const schema = z.object({ name: z.string().min(1).max(100), scopes: z.array(z.string()).optional(), expiresAt: z.string().optional() });
      const { name, scopes, expiresAt } = schema.parse(req.body);

      const { key, hash, prefix } = generateApiKey();

      const apiKey = await apiKeyRepository.create({
        organizationId: req.organizationId!,
        name,
        keyHash: hash,
        keyPrefix: prefix,
        scopes: scopes || ['read'],
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });

      await auditLogRepository.create({
        organizationId: req.organizationId!,
        userId: req.userId,
        action: 'api_key.create',
        resourceType: 'api_key',
        resourceId: apiKey.id,
        details: { name },
        ipAddress: req.ip,
      });

      res.status(201).json({ success: true, data: { ...apiKey, key } });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') } });
      }
      next(error);
    }
  });

  app.delete('/api/v1/api-keys/:id', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const revoked = await apiKeyRepository.revoke(req.params.id, req.organizationId!);
      if (!revoked) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'API key not found' } });
      }

      await auditLogRepository.create({
        organizationId: req.organizationId!,
        userId: req.userId,
        action: 'api_key.revoke',
        resourceType: 'api_key',
        resourceId: req.params.id,
        ipAddress: req.ip,
      });

      res.json({ success: true, data: null });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================
  // INTEGRATIONS
  // ============================================================

  app.get('/api/v1/integrations/status', authMiddleware, (req: AuthRequest, res) => {
    const status: Record<string, string> = {
      dataForSeo: config.providers.dataforseo.login ? 'connected' : 'not_configured',
      openai: config.providers.openai ? 'connected' : 'not_configured',
      anthropic: config.providers.anthropic ? 'connected' : 'not_configured',
      google: config.providers.googleAi ? 'connected' : 'not_configured',
      openrouter: config.providers.openrouter ? 'connected' : 'not_configured',
      perplexity: config.providers.perplexity ? 'connected' : 'not_configured',
      googleSearchConsole: config.providers.google.clientId ? 'connected' : 'not_configured',
      googleAnalytics: config.providers.google.clientId ? 'connected' : 'not_configured',
      stripe: config.providers.stripe.secretKey ? 'connected' : 'not_configured',
      s3: config.providers.s3.accessKey ? 'connected' : 'not_configured',
      dataforseo: config.providers.dataforseo.login ? 'connected' : 'not_configured',
      serpapi: config.providers.serpapi ? 'connected' : 'not_configured',
    };
    res.json({ success: true, data: status });
  });

  // ============================================================
  // PLACEHOLDER ENDPOINTS WITH REAL STRUCTURE
  // ============================================================

  app.get('/api/v1/projects/:projectId/rankings', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.organizationId!);
      if (!project) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      res.json({ success: true, data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/projects/:projectId/competitors', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.organizationId!);
      if (!project) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      res.json({ success: true, data: [] });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/projects/:projectId/backlinks', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.organizationId!);
      if (!project) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      res.json({ success: true, data: [] });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/projects/:projectId/reports', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.organizationId!);
      if (!project) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      res.json({ success: true, data: [] });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/projects/:projectId/alerts', authMiddleware, async (req: AuthRequest, res, next) => {
    try {
      const project = await projectRepository.findById(req.params.projectId, req.organizationId!);
      if (!project) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      res.json({ success: true, data: [] });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================
  // ERROR HANDLER
  // ============================================================

  app.use((error: any, req: Request, res: Response, _next: NextFunction) => {
    console.error(JSON.stringify({
      level: 'error',
      requestId: (req as any).requestId,
      message: error.message,
      stack: config.isDevelopment ? error.stack : undefined,
      path: req.path,
    }));

    if (error instanceof ApiError) {
      return res.status(error.status).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }

    if (error.status && error.code) {
      return res.status(error.status).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.errors },
      });
    }

    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: config.isProduction ? 'Internal server error' : error.message },
    });
  });

  app.use((req, res) => {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
  });

  return app;
}
