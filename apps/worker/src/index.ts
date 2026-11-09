/**
 * RankForge — Worker Process — Production Reality
 * Real PostgreSQL queue with atomic claiming (FOR UPDATE SKIP LOCKED), idempotency, timeout with AbortController, credit ledger atomic
 * No fake sleep() success
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool } from 'pg';
import * as cheerio from 'cheerio';
import { createHmac } from 'node:crypto';
import nodemailer from 'nodemailer';
import {
  DataForSeoClient,
  DataForSeoError,
  resolveDataForSeoLocationCode,
  resolveDataForSeoLanguageCode,
  findDomainPosition,
  persistRankResult,
  persistBacklinkSync,
  persistKeywordMetrics,
  persistCompetitorDiscovery,
} from './dataforseo.js';
import { runSchedulerTick } from './scheduler.js';
import { validateUrlForSSRF } from './ssrf.js';
import {
  GoogleWorkerClient,
  GoogleApiError,
  buildGscRequestBody,
  buildGa4RequestBody,
  mapGscSearchAnalyticsResponse,
  mapGa4ReportResponse,
  persistGscMetrics,
  persistRanksFromGsc,
  persistGa4Metrics,
  ensureValidAccessToken,
  markIntegrationSyncSuccess,
  markIntegrationError,
  defaultGscWindow,
  defaultGa4Window,
} from './google.js';
import {
  AiProviderError, isAiQuotaError, completeWithFallback,
  createAiProviders,
  pickAiProvider,
  aiEngineForProvider,
  analyzeGeoResponse,
  buildBriefPrompt,
  parseBriefOutline,
  buildDraftPrompt,
  cleanDraft,
  DRAFT_PROMPT_VERSION,
  recordAiUsage,
  BRIEF_PROMPT_VERSION,
  buildFixPrompt,
  parseFixSuggestions,
  selectFixCandidates,
  FIX_PROMPT_VERSION,
  type AIProvider,
} from './ai.js';
import { SerpApiClient, SerpApiError, rankDepth } from './serpapi.js';
import { runLocalIntlAudit } from './local-intl-audit.js';
import { proposeRedirects } from './redirects.js';
import { referringDomains, graphDomain } from './commoncrawl.js';

// Common Crawl domain graph used when none is configured (COMMONCRAWL_GRAPH_RELEASE); releases come out every few months.
const DEFAULT_GRAPH_RELEASE = 'cc-main-2025-26-nov-dec-jan';
const GRAPH_JOB_TIMEOUT_MS = parseInt(process.env.COMMONCRAWL_TIMEOUT || String(6 * 3600_000), 10);
import { KwRankClient, KwRankError, KWRANK_COUNTRY_IDS, KWRANK_COMPETITION, kwRankDevice, matchKwRankKeywords } from './kwrank.js';

// ============================================================
// CONFIG — env-based, fail-fast
// ============================================================

// Load the monorepo-root .env for local development — the documented
// setup creates a single .env at the repo root, and without this the
// local commands (db:migrate, dev servers) cannot see it. Variables
// already present in the process environment always win: Docker
// Compose injects env directly and its images contain no .env file.
import { existsSync as _existsSync, readFileSync as _readFileSync, writeFileSync as _writeFileSync } from 'node:fs';
import _path from 'node:path';
import { fileURLToPath as _fileURLToPath } from 'node:url';
(() => {
  const here = _path.dirname(_fileURLToPath(import.meta.url));
  const candidates = [
    _path.resolve(process.cwd(), '.env'),
    _path.resolve(here, '../../../.env'),
    _path.resolve(here, '../../../../.env'),
  ];
  for (const file of candidates) {
    if (!_existsSync(file)) continue;
    for (const line of _readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
})();

const config = {
  database: {
    url: process.env.DATABASE_URL || '',
  },
  isProduction: process.env.NODE_ENV === 'production',
  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '3', 10),
    timeout: parseInt(process.env.WORKER_TIMEOUT || '300000', 10), // 5 min default
    pollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL || '2000', 10),
  },
  crawler: {
    maxConcurrency: parseInt(process.env.CRAWLER_MAX_CONCURRENCY || '3', 10),
    timeout: parseInt(process.env.CRAWLER_TIMEOUT || '30000', 10),
    delay: parseInt(process.env.CRAWLER_DELAY || '1000', 10),
    userAgent: process.env.CRAWLER_USER_AGENT || 'SeoYarBot/1.0',
  },
  providers: {
    dataforseo: {
      login: process.env.DATAFORSEO_LOGIN || '',
      password: process.env.DATAFORSEO_PASSWORD || '',
    },
    serpapi: process.env.SERPAPI_KEY || '',
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
    openai: process.env.OPENAI_API_KEY || '',
    anthropic: process.env.ANTHROPIC_API_KEY || '',
    googleAi: process.env.GOOGLE_AI_API_KEY || '',
    perplexity: process.env.PERPLEXITY_API_KEY || '',
    pagespeed: process.env.PAGESPEED_API_KEY || '',
  },
};

if (!config.database.url) {
  console.error('❌ DATABASE_URL required for worker — FAIL FAST');
  process.exit(1);
}

// ============================================================
// DB
// ============================================================

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: config.database.url,
    // SSL is opt-in via DATABASE_SSL=true: stock PostgreSQL (incl. the
    // postgres:16-alpine compose service) does not serve SSL, so forcing
    // SSL in production made the shipped stack unable to reach its own
    // database. Managed DBs that require SSL set DATABASE_SSL=true.
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
    max: 10,
  });
  pool.on('error', (err) => {
    console.error(JSON.stringify({ level: 'error', msg: 'Pool error', error: err.message }));
  });
  return pool;
}

// Tenant access is bound to the job being executed. Handlers run inside
// jobContext, and every statement runs in a transaction that first calls
// rf_worker_bind_job: PostgreSQL then enforces both the tenant and that this
// execution still owns the job. A statement outside a job context is an error,
// never an unscoped query.
type JobContext = { jobId: string; executionId: string };
const jobContext = new AsyncLocalStorage<JobContext>();

/** Runs a queue or scheduler call. Tenant data is unreachable from here. */
async function withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Runs fn atomically under the current job's tenant binding. */
async function withJobTransaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const context = jobContext.getStore();
  if (!context) throw new Error('Tenant query attempted outside a job context');
  return withTransaction(async (client) => {
    await client.query('SELECT rf_worker_bind_job($1, $2)', [context.jobId, context.executionId]);
    return fn(client);
  });
}

async function query(text: string, params?: any[]): Promise<any> {
  return withJobTransaction<any>((client) => client.query(text, params));
}

// ============================================================
// OUTBOUND FETCH — SSRF validated per hop (see ./ssrf.ts)
// ============================================================

async function safeFetch(url: string, options: { userAgent?: string; timeout?: number; signal?: AbortSignal } = {}): Promise<Response> {
  await validateUrlForSSRF(url);
  
  const controller = new AbortController();
  const timeoutMs = options.timeout || 30000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  // Combine external signal with timeout signal
  const combinedSignal = options.signal ? 
    (() => {
      if (options.signal.aborted) controller.abort();
      options.signal.addEventListener('abort', () => controller.abort());
      return controller.signal;
    })() : controller.signal;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': options.userAgent || config.crawler.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: combinedSignal,
      redirect: 'manual', // Handle redirects manually to re-validate SSRF
    });

    // Handle redirects with SSRF re-validation
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (location) {
        const redirectUrl = new URL(location, url).toString();
        await validateUrlForSSRF(redirectUrl);
        // For simplicity, follow one level of redirect with validation
        if (res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308) {
          clearTimeout(timeoutId);
          return safeFetch(redirectUrl, options);
        }
      }
    }

    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// CRAWLER — Real implementation (copied from api, with AbortController support)
// ============================================================

interface CrawlOptions {
  maxPages: number;
  maxDepth: number;
  concurrency: number;
  delay: number;
  userAgent: string;
  respectRobotsTxt: boolean;
  timeout: number;
  organizationId: string;
  projectId: string;
  signal?: AbortSignal;
}

interface CrawlPage {
  url: string;
  normalizedUrl: string;
  statusCode: number;
  contentType?: string;
  title?: string;
  metaDescription?: string;
  h1?: string;
  h2: string[];
  h3: string[];
  wordCount: number;
  responseTime: number;
  isIndexable: boolean;
  canonical?: string;
  robotsMeta?: string;
  hreflang: Array<{ lang: string; href: string }>;
  structuredData: any[];
  /** lang attribute of <html>. */
  htmlLang?: string;
  /** tel: links on the page. */
  phones?: string[];
  images: Array<{ src: string; alt?: string; width?: number; height?: number }>;
  links: Array<{ href: string; text: string; isInternal: boolean; rel?: string }>;
  headers: Record<string, string>;
  depth: number;
  parentUrl?: string;
}

interface CrawlResult {
  pages: CrawlPage[];
  sitemapUrls: string[];
  robotsTxt?: string;
  errors: Array<{ url: string; error: string }>;
  stats: {
    totalDiscovered: number;
    crawled: number;
    failed: number;
    duration: number;
  };
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString().toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function isSameDomain(url1: string, url2: string): boolean {
  try {
    const d1 = new URL(url1).hostname.replace(/^www\./, '');
    const d2 = new URL(url2).hostname.replace(/^www\./, '');
    return d1 === d2;
  } catch {
    return false;
  }
}

async function fetchRobotsTxt(baseUrl: string, userAgent: string, signal?: AbortSignal): Promise<{ content: string; rules: { disallow: string[]; allow: string[]; sitemap: string[] } }> {
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl).toString();
    await validateUrlForSSRF(robotsUrl);
    const res = await safeFetch(robotsUrl, { userAgent, timeout: 10000, signal });
    if (!res.ok) return { content: '', rules: { disallow: [], allow: [], sitemap: [] } };
    const content = await res.text();
    const disallow: string[] = [];
    const allow: string[] = [];
    const sitemap: string[] = [];
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().startsWith('disallow:')) {
        const p = trimmed.substring(9).trim();
        if (p) disallow.push(p);
      } else if (trimmed.toLowerCase().startsWith('allow:')) {
        const p = trimmed.substring(6).trim();
        if (p) allow.push(p);
      } else if (trimmed.toLowerCase().startsWith('sitemap:')) {
        const u = trimmed.substring(8).trim();
        if (u) sitemap.push(u);
      }
    });
    return { content, rules: { disallow, allow, sitemap } };
  } catch {
    return { content: '', rules: { disallow: [], allow: [], sitemap: [] } };
  }
}

function isUrlAllowedByRobots(url: string, rules: { disallow: string[]; allow: string[] }): boolean {
  try {
    const pathname = new URL(url).pathname;
    for (const allowPath of rules.allow) {
      if (pathname.startsWith(allowPath)) return true;
    }
    for (const disallowPath of rules.disallow) {
      if (disallowPath === '/') return false;
      if (disallowPath && pathname.startsWith(disallowPath)) return false;
    }
    return true;
  } catch {
    return true;
  }
}

const MAX_HTML_BYTES = 5 * 1024 * 1024;

/** Reads at most maxBytes so a hostile site cannot exhaust the worker's memory. */
async function readBodyCapped(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return response.text();
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let total = 0;
  let html = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      break;
    }
    html += decoder.decode(value, { stream: true });
  }
  return html + decoder.decode();
}

class Crawler {
  private options: CrawlOptions;
  private visited = new Set<string>();
  private queue: Array<{ url: string; depth: number; parentUrl?: string }> = [];
  private pages: CrawlPage[] = [];
  private errors: Array<{ url: string; error: string }> = [];
  private robotsRules: { disallow: string[]; allow: string[]; sitemap: string[] } = { disallow: [], allow: [], sitemap: [] };
  private robotsContent?: string;
  private sitemapUrls: string[] = [];

  constructor(options: CrawlOptions) {
    this.options = options;
  }

  async crawl(startUrl: string): Promise<CrawlResult> {
    const startTime = Date.now();
    await validateUrlForSSRF(startUrl);

    if (this.options.respectRobotsTxt) {
      const robots = await fetchRobotsTxt(startUrl, this.options.userAgent, this.options.signal);
      this.robotsContent = robots.content;
      this.robotsRules = robots.rules;
      this.sitemapUrls = robots.rules.sitemap;
    }

    this.queue.push({ url: startUrl, depth: 0 });

    while (this.queue.length > 0 && this.pages.length < this.options.maxPages) {
      if (this.options.signal?.aborted) {
        throw new Error('Crawl aborted — TIMEOUT');
      }

      const batch = this.queue.splice(0, this.options.concurrency);
      await Promise.all(batch.map(item => this.crawlPage(item)));

      if (this.options.delay > 0) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, this.options.delay);
          this.options.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('Crawl aborted during delay — TIMEOUT'));
          });
        });
      }
    }

    return {
      pages: this.pages,
      sitemapUrls: this.sitemapUrls,
      robotsTxt: this.robotsContent,
      errors: this.errors,
      stats: {
        totalDiscovered: this.visited.size,
        crawled: this.pages.length,
        failed: this.errors.length,
        duration: Date.now() - startTime,
      },
    };
  }

  private async crawlPage(item: { url: string; depth: number; parentUrl?: string }): Promise<void> {
    if (this.options.signal?.aborted) throw new Error('Crawl aborted — TIMEOUT');
    
    const normalized = normalizeUrl(item.url);
    if (this.visited.has(normalized)) return;
    this.visited.add(normalized);
    if (item.depth > this.options.maxDepth) return;
    if (this.options.respectRobotsTxt && !isUrlAllowedByRobots(item.url, this.robotsRules)) return;

    const startTime = Date.now();
    try {
      await validateUrlForSSRF(item.url);
      const response = await safeFetch(item.url, {
        userAgent: this.options.userAgent,
        timeout: this.options.timeout,
        signal: this.options.signal,
      });

      const responseTime = Date.now() - startTime;
      const contentType = response.headers.get('content-type') || '';

      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        this.pages.push({
          url: item.url,
          normalizedUrl: normalized,
          statusCode: response.status,
          contentType,
          h2: [],
          h3: [],
          wordCount: 0,
          responseTime,
          isIndexable: false,
          hreflang: [],
          structuredData: [],
          images: [],
          links: [],
          headers: Object.fromEntries(response.headers.entries()),
          depth: item.depth,
          parentUrl: item.parentUrl,
        });
        return;
      }

      const html = await readBodyCapped(response, MAX_HTML_BYTES);
      const $ = cheerio.load(html);

      const title = $('title').first().text().trim() || undefined;
      const metaDescription = $('meta[name="description"]').attr('content')?.trim();
      const h1 = $('h1').first().text().trim() || undefined;
      const h2 = $('h2').map((_, el) => $(el).text().trim()).get().filter(Boolean);
      const h3 = $('h3').map((_, el) => $(el).text().trim()).get().filter(Boolean);
      const bodyText = $('body').text();
      const wordCount = bodyText.trim().split(/\s+/).filter(Boolean).length;
      const canonical = $('link[rel="canonical"]').attr('href');
      const robotsMeta = $('meta[name="robots"]').attr('content');
      const isIndexable = !(robotsMeta?.toLowerCase().includes('noindex') || response.headers.get('x-robots-tag')?.toLowerCase().includes('noindex'));
      const hreflang = $('link[rel="alternate"][hreflang]').map((_, el) => ({
        lang: $(el).attr('hreflang') || '',
        href: $(el).attr('href') || '',
      })).get();
      const htmlLang = $('html').attr('lang')?.trim() || undefined;
      const phones = [...new Set($('a[href^="tel:"]').map((_, el) => ($(el).attr('href') || '').slice(4).trim()).get().filter(Boolean))].slice(0, 20);
      const structuredData: any[] = [];
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const data = JSON.parse($(el).html() || '');
          structuredData.push(data);
        } catch {}
      });
      const images = $('img').map((_, el) => ({
        src: $(el).attr('src') || '',
        alt: $(el).attr('alt'),
        width: $(el).attr('width') ? parseInt($(el).attr('width')!, 10) : undefined,
        height: $(el).attr('height') ? parseInt($(el).attr('height')!, 10) : undefined,
      })).get().filter(img => img.src);
      const links = $('a[href]').map((_, el) => {
        const href = $(el).attr('href') || '';
        let absoluteHref = href;
        try {
          absoluteHref = new URL(href, item.url).toString();
        } catch {}
        return {
          href: absoluteHref,
          text: $(el).text().trim().slice(0, 200),
          isInternal: isSameDomain(item.url, absoluteHref),
          rel: $(el).attr('rel'),
        };
      }).get().filter(link => link.href.startsWith('http'));

      if (item.depth < this.options.maxDepth) {
        for (const link of links) {
          if (link.isInternal) {
            const normalizedLink = normalizeUrl(link.href);
            if (!this.visited.has(normalizedLink) && !this.queue.some(q => normalizeUrl(q.url) === normalizedLink)) {
              this.queue.push({ url: link.href, depth: item.depth + 1, parentUrl: item.url });
            }
          }
        }
      }

      this.pages.push({
        url: item.url,
        normalizedUrl: normalized,
        statusCode: response.status,
        contentType,
        title,
        metaDescription,
        h1,
        h2,
        h3,
        wordCount,
        responseTime,
        isIndexable,
        canonical,
        robotsMeta,
        hreflang,
        structuredData,
        htmlLang,
        phones,
        images,
        links,
        headers: Object.fromEntries(response.headers.entries()),
        depth: item.depth,
        parentUrl: item.parentUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.errors.push({ url: item.url, error: message });
      if (message.includes('SECURITY_ERROR')) {
        console.warn(JSON.stringify({ level: 'warn', msg: 'SSRF blocked', url: item.url, error: message }));
      }
    }
  }
}

// ============================================================
// AUDIT ENGINE — Deterministic
// ============================================================

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'notice';
type Category = 'crawlability' | 'indexability' | 'metadata' | 'content' | 'links' | 'images' | 'performance' | 'security' | 'structured_data' | 'international' | 'local';

interface AuditFinding {
  ruleId: string;
  severity: Severity;
  category: Category;
  title: string;
  description: string;
  evidence: Record<string, any>;
  affectedUrls: string[];
  recommendation: string;
}

interface AuditContext {
  pages: CrawlPage[];
  domain: string;
  sitemapUrls: string[];
  robotsTxt?: string;
}

function runAudit(context: AuditContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  
  // missing_title
  const missingTitle = context.pages.filter(p => !p.title);
  if (missingTitle.length > 0) {
    findings.push({
      ruleId: 'missing_title',
      severity: 'critical',
      category: 'metadata',
      title: 'Missing Title Tag',
      description: `${missingTitle.length} page(s) missing title`,
      evidence: { count: missingTitle.length, examples: missingTitle.slice(0,3).map(p=>p.url) },
      affectedUrls: missingTitle.map(p=>p.url),
      recommendation: 'Add unique title tags 50-60 chars',
    });
  }

  // duplicate_title
  const titleMap = new Map<string, string[]>();
  context.pages.forEach(p => {
    if (p.title) {
      const n = p.title.toLowerCase().trim();
      if (!titleMap.has(n)) titleMap.set(n, []);
      titleMap.get(n)!.push(p.url);
    }
  });
  const dupTitles = Array.from(titleMap.entries()).filter(([_, urls]) => urls.length > 1);
  if (dupTitles.length > 0) {
    findings.push({
      ruleId: 'duplicate_title',
      severity: 'high',
      category: 'metadata',
      title: 'Duplicate Title Tags',
      description: `${dupTitles.length} duplicate titles`,
      evidence: { duplicates: dupTitles.slice(0,3) },
      affectedUrls: dupTitles.flatMap(([_, urls]) => urls),
      recommendation: 'Make titles unique',
    });
  }

  // title_too_long
  const longTitle = context.pages.filter(p => p.title && p.title.length > 60);
  if (longTitle.length > 0) {
    findings.push({
      ruleId: 'title_too_long',
      severity: 'medium',
      category: 'metadata',
      title: 'Title Too Long',
      description: `${longTitle.length} titles >60 chars`,
      evidence: { count: longTitle.length },
      affectedUrls: longTitle.map(p=>p.url),
      recommendation: 'Keep titles <60 chars',
    });
  }

  // missing_meta_description
  const missingDesc = context.pages.filter(p => !p.metaDescription);
  if (missingDesc.length > 0) {
    findings.push({
      ruleId: 'missing_meta_description',
      severity: 'medium',
      category: 'metadata',
      title: 'Missing Meta Description',
      description: `${missingDesc.length} pages missing meta description`,
      evidence: { count: missingDesc.length },
      affectedUrls: missingDesc.map(p=>p.url),
      recommendation: 'Add meta descriptions 150-160 chars',
    });
  }

  // missing_h1
  const missingH1 = context.pages.filter(p => !p.h1);
  if (missingH1.length > 0) {
    findings.push({
      ruleId: 'missing_h1',
      severity: 'high',
      category: 'content',
      title: 'Missing H1',
      description: `${missingH1.length} pages missing H1`,
      evidence: { count: missingH1.length },
      affectedUrls: missingH1.map(p=>p.url),
      recommendation: 'Add single H1 per page',
    });
  }

  // thin_content
  const thin = context.pages.filter(p => p.wordCount < 300 && p.statusCode === 200 && p.isIndexable);
  if (thin.length > 0) {
    findings.push({
      ruleId: 'thin_content',
      severity: 'medium',
      category: 'content',
      title: 'Thin Content',
      description: `${thin.length} pages <300 words`,
      evidence: { examples: thin.slice(0,3).map(p=>({url:p.url, words:p.wordCount})) },
      affectedUrls: thin.map(p=>p.url),
      recommendation: 'Expand to 300-500 words',
    });
  }

  // images_without_alt
  const missingAltPages: string[] = [];
  let totalMissingAlt = 0;
  context.pages.forEach(p => {
    const missing = p.images.filter(img => !img.alt).length;
    if (missing > 0) {
      missingAltPages.push(p.url);
      totalMissingAlt += missing;
    }
  });
  if (missingAltPages.length > 0) {
    findings.push({
      ruleId: 'images_without_alt',
      severity: 'low',
      category: 'images',
      title: 'Images Without Alt',
      description: `${totalMissingAlt} images missing alt across ${missingAltPages.length} pages`,
      evidence: { totalMissing: totalMissingAlt },
      affectedUrls: missingAltPages,
      recommendation: 'Add alt text',
    });
  }

  // broken_links (4xx/5xx)
  const broken = context.pages.filter(p => p.statusCode >= 400);
  if (broken.length > 0) {
    findings.push({
      ruleId: 'broken_links',
      severity: 'high',
      category: 'links',
      title: 'Broken Pages',
      description: `${broken.length} pages 4xx/5xx`,
      evidence: { examples: broken.slice(0,5).map(p=>({url:p.url, status:p.statusCode})) },
      affectedUrls: broken.map(p=>p.url),
      recommendation: 'Fix broken URLs',
    });
  }

  // noindex
  const noindex = context.pages.filter(p => !p.isIndexable);
  if (noindex.length > 0) {
    findings.push({
      ruleId: 'noindex_pages',
      severity: 'notice',
      category: 'indexability',
      title: 'Noindex Pages',
      description: `${noindex.length} noindex pages`,
      evidence: { count: noindex.length },
      affectedUrls: noindex.map(p=>p.url),
      recommendation: 'Review noindex',
    });
  }

  // missing_canonical
  const missingCanon = context.pages.filter(p => !p.canonical && p.isIndexable);
  if (missingCanon.length > 0) {
    findings.push({
      ruleId: 'missing_canonical',
      severity: 'low',
      category: 'indexability',
      title: 'Missing Canonical',
      description: `${missingCanon.length} indexable pages missing canonical`,
      evidence: { count: missingCanon.length },
      affectedUrls: missingCanon.map(p=>p.url),
      recommendation: 'Add self-referencing canonical',
    });
  }

  // slow_pages
  const slow = context.pages.filter(p => p.responseTime > 2000);
  if (slow.length > 0) {
    findings.push({
      ruleId: 'slow_pages',
      severity: 'medium',
      category: 'performance',
      title: 'Slow Pages',
      description: `${slow.length} pages >2s`,
      evidence: { examples: slow.slice(0,5).map(p=>({url:p.url, time:p.responseTime})) },
      affectedUrls: slow.map(p=>p.url),
      recommendation: 'Optimize response time',
    });
  }

  // missing_structured_data
  const missingSD = context.pages.filter(p => p.structuredData.length === 0 && p.isIndexable && p.wordCount > 200);
  if (missingSD.length > 0) {
    findings.push({
      ruleId: 'missing_structured_data',
      severity: 'low',
      category: 'structured_data',
      title: 'Missing Structured Data',
      description: `${missingSD.length} pages without structured data`,
      evidence: { count: missingSD.length },
      affectedUrls: missingSD.map(p=>p.url),
      recommendation: 'Add JSON-LD',
    });
  }

  // insecure_links
  const insecure = context.pages.filter(p => p.links.some(l => l.href.startsWith('http://') && l.isInternal));
  if (insecure.length > 0) {
    findings.push({
      ruleId: 'insecure_links',
      severity: 'medium',
      category: 'security',
      title: 'Insecure HTTP Links',
      description: `${insecure.length} pages with internal HTTP links`,
      evidence: { count: insecure.length },
      affectedUrls: insecure.map(p=>p.url),
      recommendation: 'Update to HTTPS',
    });
  }

  // missing_viewport
  // Note: would need to check meta viewport, simplified
  // robots.txt missing
  if (!context.robotsTxt) {
    findings.push({
      ruleId: 'missing_robots_txt',
      severity: 'low',
      category: 'crawlability',
      title: 'Missing robots.txt',
      description: 'No robots.txt found',
      evidence: { domain: context.domain },
      affectedUrls: [`https://${context.domain}/robots.txt`],
      recommendation: 'Add robots.txt',
    });
  }

  // sitemap missing
  if (context.sitemapUrls.length === 0) {
    findings.push({
      ruleId: 'missing_sitemap',
      severity: 'low',
      category: 'crawlability',
      title: 'Missing Sitemap',
      description: 'No sitemap found',
      evidence: { domain: context.domain },
      affectedUrls: [`https://${context.domain}/sitemap.xml`],
      recommendation: 'Add sitemap.xml',
    });
  }

  findings.push(...runLocalIntlAudit(context.pages));
  return findings;
}

const PAGE_PENALTY: Record<Severity, number> = { critical: 100, high: 100, medium: 10, low: 3, notice: 0 };
const SITE_WIDE_PENALTY: Record<Severity, number> = { critical: 10, high: 5, medium: 3, low: 2, notice: 0 };
const MAX_WARNING_PENALTY = 30;
const ALL_SCORE_CATEGORIES = ['crawlability','indexability','metadata','content','links','images','performance','security','structured_data','international','local'];

function calculateSeoScore(findings: AuditFinding[], pageUrls?: string[]): { overall: number; categories: Record<string, number> } {
  // Site health, in the style of the market leaders: the average health of the crawled pages.
  // A page with an error (critical or high) scores 0, as in the Ahrefs Health Score. Lesser issues
  // lower a page by a smaller amount, and pages without issues stay at 100. Issues that are not
  // tied to a crawled page, such as a missing sitemap, take a small fixed amount off the site.
  const pages = new Set(pageUrls ?? findings.flatMap((f) => f.affectedUrls));
  if (pageUrls && pages.size === 0) {
    return { overall: 0, categories: Object.fromEntries(ALL_SCORE_CATEGORIES.map((cat) => [cat, 0])) as Record<string, number> };
  }
  const health = (items: AuditFinding[]): number => {
    const pagePenalty = new Map<string, number>();
    let siteWide = 0;
    for (const finding of items) {
      const isError = finding.severity === 'critical' || finding.severity === 'high';
      const onPages = [...new Set(finding.affectedUrls)].filter((url) => pages.has(url));
      if (onPages.length === 0) siteWide += SITE_WIDE_PENALTY[finding.severity];
      for (const url of onPages) {
        const current = pagePenalty.get(url) ?? 0;
        pagePenalty.set(url, isError ? 100 : current >= 100 ? 100 : Math.max(current, Math.min(MAX_WARNING_PENALTY, current + PAGE_PENALTY[finding.severity])));
      }
    }
    const lost = [...pagePenalty.values()].reduce((sum, penalty) => sum + penalty, 0);
    const average = pages.size > 0 ? 100 - lost / pages.size : 100;
    return Math.round(Math.max(0, Math.min(100, average - siteWide)));
  };
  const categories = Object.fromEntries(ALL_SCORE_CATEGORIES.map((cat) => [cat, health(findings.filter((f) => f.category === cat))])) as Record<string, number>;
  return { overall: health(findings), categories };
}

// ============================================================
// JOB TYPES
// ============================================================

interface Job {
  id: string;
  organizationId: string;
  projectId?: string;
  type: string;
  status: string;
  payload: any;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  idempotencyKey?: string;
  executionId: string;
}

// ============================================================
// DATAFORSEO — real provider wiring for RANK_CHECK / BACKLINK_SYNC
// (client + persistence live in ./dataforseo.ts, mirroring the API
// lib's providers.ts; credentials come from env, like every other
// provider in this worker — see config.providers above)
// ============================================================

function createDataForSeoClient(): DataForSeoClient {
  return new DataForSeoClient(config.providers.dataforseo.login, config.providers.dataforseo.password);
}

function createKwRankClient(): KwRankClient {
  return new KwRankClient(process.env.KWRANK_CLIENT_ID || '', process.env.KWRANK_CLIENT_SECRET || '', process.env.KWRANK_BASE_URL || 'https://kwrank.ir/api/v1');
}

function createSerpApiClient(): SerpApiClient {
  return new SerpApiClient(config.providers.serpapi, process.env.SERPAPI_BASE_URL || 'https://serpapi.com');
}

// ============================================================
// GOOGLE — real Search Console / GA4 sync wiring for GSC_SYNC /
// GA4_SYNC (client + mappers + persistence live in ./google.ts,
// mirroring the API app's Google module; OAuth app credentials come
// from env — the per-account tokens come from the integrations
// table, written by the API's OAuth connect flow)
// ============================================================

function createGoogleClient(): GoogleWorkerClient {
  return new GoogleWorkerClient({
    clientId: config.providers.google.clientId,
    clientSecret: config.providers.google.clientSecret,
  });
}

/** Map a Google failure onto a job error — the provider's own message always surfaces. */
function googleErrorToJobError(error: unknown, context: string): JobError {
  if (error instanceof GoogleApiError) {
    if (error.providerError === 'invalid_grant' || error.providerError === 'no_refresh_token' || error.providerError === 'no_credentials') {
      // The grant is dead: retrying cannot help; the user must reconnect.
      return new JobError(`${context} — Google connection expired or revoked, reconnect required — ${error.message}`, 'PROVIDER_NOT_CONFIGURED', false);
    }
    if (error.httpStatus === 401 || error.httpStatus === 403) {
      return new JobError(`${context} — Google authorization failed — ${error.message}`, 'NON_RETRYABLE', false);
    }
    return new JobError(`${context} failed — ${error.message}`, 'RETRYABLE', true);
  }
  return new JobError(`${context} failed — ${error instanceof Error ? error.message : String(error)}`, 'RETRYABLE', true);
}

// ============================================================
// AI PROVIDERS — GEO (AI_VISIBILITY_CHECK) + CONTENT_BRIEF
// (client + analysis live in ./ai.ts, mirroring the API lib's
// ai-providers.ts; credentials come from env, like every other
// provider in this worker)
// ============================================================

function createWorkerAiProviders(): AIProvider[] {
  return createAiProviders({
    openai: config.providers.openai,
    anthropic: config.providers.anthropic,
    googleAi: config.providers.googleAi,
    perplexity: config.providers.perplexity,
  });
}

const AI_NOT_CONFIGURED_MESSAGE = 'AI provider not configured — set OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_AI_API_KEY or PERPLEXITY_API_KEY — PROVIDER_NOT_CONFIGURED';

/** Map an AI provider failure onto a job error — the provider's own message always surfaces. */
function aiErrorToJobError(error: unknown, context: string): JobError {
  if (error instanceof AiProviderError) {
    if (error.httpStatus === 401 || error.httpStatus === 403) {
      return new JobError(`AI provider authentication failed — ${error.message}`, 'NON_RETRYABLE', false);
    }
    if (isAiQuotaError(error)) {
      return new JobError(`AI provider has no credit — ${error.message}`, 'NON_RETRYABLE', false);
    }
    // A rejected request or a retired model gives the same answer on every attempt.
    if (error.httpStatus === 400 || error.httpStatus === 404) {
      return new JobError(`${context} failed — ${error.message}`, 'NON_RETRYABLE', false);
    }
    return new JobError(`${context} failed — ${error.message}`, 'RETRYABLE', true);
  }
  return new JobError(`${context} failed — ${error instanceof Error ? error.message : String(error)}`, 'RETRYABLE', true);
}

/** Map a provider failure onto a job error — the provider's own message always surfaces. */
function providerErrorToJobError(error: unknown, context: string): JobError {
  if (error instanceof DataForSeoError) {
    if (error.httpStatus === 401 || error.httpStatus === 403) {
      // Credentials were supplied but rejected by DataForSEO — retrying won't help.
      return new JobError(`DataForSEO authentication failed — ${error.message}`, 'NON_RETRYABLE', false);
    }
    return new JobError(`${context} failed — ${error.message}`, 'RETRYABLE', true);
  }
  if (error instanceof JobError) return error;
  if (error instanceof KwRankError) {
    // Wrong credentials or no active API plan will not fix themselves on retry.
    if (error.httpStatus === 401 || error.httpStatus === 403 || error.httpStatus === 402) {
      return new JobError(`KWRank account error — ${error.message}`, 'NON_RETRYABLE', false);
    }
    return new JobError(`${context} failed — ${error.message}`, 'RETRYABLE', true);
  }
  if (error instanceof SerpApiError) {
    // A rejected key or an exhausted plan will not fix itself on retry.
    if (error.httpStatus === 401 || error.httpStatus === 403 || /invalid api key|run out of searches|plan|account/i.test(error.message)) {
      return new JobError(`SerpApi account error — ${error.message}`, 'NON_RETRYABLE', false);
    }
    return new JobError(`${context} failed — ${error.message}`, 'RETRYABLE', true);
  }
  return new JobError(`${context} failed — ${error instanceof Error ? error.message : String(error)}`, 'RETRYABLE', true);
}

type JobErrorCode = 'RETRYABLE' | 'NON_RETRYABLE' | 'PROVIDER_NOT_CONFIGURED' | 'VALIDATION_ERROR' | 'SECURITY_ERROR' | 'TIMEOUT' | 'INTERNAL_ERROR' | 'INSUFFICIENT_CREDITS' | 'QUOTA_EXCEEDED';

class JobError extends Error {
  code: JobErrorCode;
  retryable: boolean;
  constructor(message: string, code: JobErrorCode, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

// ============================================================
// WORKER — Atomic claiming, real work, AbortController timeout
// ============================================================

const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE || '/tmp/rankforge-worker-heartbeat';

/** Lets the container healthcheck detect a stuck loop, not only a dead process. */
function writeHeartbeat() {
  try { _writeFileSync(HEARTBEAT_FILE, String(Date.now())); } catch { /* read-only disk must not stop jobs */ }
}

const COMPLETION_EVENTS: Record<string, string> = {
  SITE_CRAWL: 'crawl.completed',
  SEO_AUDIT: 'audit.completed',
  AUDIT: 'audit.completed',
  RANK_CHECK: 'rank.updated',
  REPORT_GENERATION: 'report.generated',
};

/** Only summary fields leave the system: reports and crawl data stay behind the API. */
function eventSummary(result: any): Record<string, unknown> {
  const { crawlRunId, reportId, seoScore, findingsCount, pagesCrawled, ranked, notRanked } = result || {};
  return Object.fromEntries(Object.entries({ crawlRunId, reportId, seoScore, findingsCount, pagesCrawled, ranked, notRanked }).filter(([, v]) => v !== undefined));
}

const MAX_PAGES_PER_CRAWL = 1000;
const MAX_CRAWL_DEPTH = 10;

class Worker {
  private running = false;
  private activeJobs = 0;
  private concurrency = config.worker.concurrency;
  private timeout = config.worker.timeout;
  private pollInterval = config.worker.pollIntervalMs;
  private schedulerTickMs = parseInt(process.env.SCHEDULER_TICK_MS || '15000', 10);
  private schedulerEnabled = process.env.SCHEDULER_ENABLED !== 'false';
  private lastSchedulerTickAt = 0;

  async start() {
    console.log(JSON.stringify({ level: 'info', msg: 'Worker starting', concurrency: this.concurrency, timeout: this.timeout, database: config.database.url ? 'configured' : 'NOT_CONFIGURED', scheduler: this.schedulerEnabled ? `tick ${this.schedulerTickMs}ms` : 'disabled' }));
    this.running = true;

    while (this.running) {
      try {
        await this.processNextJobs();
        await this.maybeRunScheduler();
        writeHeartbeat();
        await this.sleep(this.pollInterval);
      } catch (error) {
        console.error(JSON.stringify({ level: 'error', msg: 'Worker loop error', error: error instanceof Error ? error.message : String(error) }));
        await this.sleep(5000);
      }
    }
  }

  /** Throttled scheduler tick — enqueues jobs for due scheduled_jobs rows (see ./scheduler.ts). */
  private async maybeRunScheduler() {
    if (!this.schedulerEnabled) return;
    const nowMs = Date.now();
    if (nowMs - this.lastSchedulerTickAt < this.schedulerTickMs) return;
    this.lastSchedulerTickAt = nowMs;
    try {
      const summary = await runSchedulerTick((fn) => withTransaction(fn));
      if (summary.fired > 0 || summary.initialized > 0 || summary.skipped > 0 || summary.parked > 0) {
        console.log(JSON.stringify({ level: 'info', msg: 'Scheduler tick', ...summary }));
      }
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', msg: 'Scheduler tick failed', error: error instanceof Error ? error.message : String(error) }));
    }
  }

  stop() {
    console.log(JSON.stringify({ level: 'info', msg: 'Worker stopping' }));
    this.running = false;
  }

  private async processNextJobs() {
    if (this.activeJobs >= this.concurrency) return;

    const availableSlots = this.concurrency - this.activeJobs;
    
    try {
      // Atomic claim (FOR UPDATE SKIP LOCKED) lives in rf_worker_claim_jobs, which
      // also records the attempt and recovers jobs whose worker died.
      const leaseSeconds = Math.ceil(this.timeout / 1000) + 60;
      const claimedJobs = await withTransaction(async (client) => {
        const claimed = await client.query(
          `SELECT id, organization_id AS "organizationId", project_id AS "projectId", type, status, payload, attempts,
                  max_attempts AS "maxAttempts", created_at AS "createdAt", idempotency_key AS "idempotencyKey", execution_id AS "executionId"
           FROM rf_worker_claim_jobs($1, $2)`,
          [availableSlots, leaseSeconds],
        );
        return claimed.rows as Job[];
      });

      if (claimedJobs.length === 0) return;

      console.log(JSON.stringify({ level: 'info', msg: 'Jobs claimed atomically', count: claimedJobs.length, jobIds: claimedJobs.map(j=>j.id) }));

      for (const job of claimedJobs) {
        this.activeJobs++;
        this.processJob(job).finally(() => {
          this.activeJobs--;
        });
      }
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', msg: 'Failed to claim jobs', error: error instanceof Error ? error.message : String(error) }));
    }
  }

  private async processJob(job: Job) {
    const startTime = Date.now();
    const executionId = job.executionId;
    const logFields = {
      job_id: job.id,
      execution_id: executionId,
      organization_id: job.organizationId,
      project_id: job.projectId,
      job_type: job.type,
    };

    console.log(JSON.stringify({ level: 'info', msg: 'Processing job', ...logFields, attempt: job.attempts, maxAttempts: job.maxAttempts }));

    const abortController = new AbortController();
    let timeoutId: NodeJS.Timeout | null = null;
    // Streaming the link graph takes hours; that job extends its own lease while it works.
    const jobTimeout = job.type === 'BACKLINK_DISCOVERY' ? GRAPH_JOB_TIMEOUT_MS : this.timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        abortController.abort();
        reject(new JobError(`Job timeout after ${jobTimeout}ms`, 'TIMEOUT', true));
      }, jobTimeout);
    });

    try {
      const result = await jobContext.run({ jobId: job.id, executionId }, async () => {
        const work = (async () => {
          await this.chargeForJob(job, executionId);
          const output = await this.executeJob(job, abortController.signal);
          await this.createAlertIfNeeded(job, 'completed', output);
          return output;
        })();
        return Promise.race([work, timeoutPromise]);
      });
      if (timeoutId) clearTimeout(timeoutId);

      const duration = Date.now() - startTime;
      const owned = await withTransaction(async (client) => {
        const done = await client.query(
          'SELECT rf_worker_complete_job($1, $2, $3, $4) AS owned',
          [job.id, executionId, JSON.stringify(result ?? { completedAt: new Date().toISOString(), durationMs: duration, executionId }), duration],
        );
        return done.rows[0].owned as boolean;
      });

      if (owned) {
        console.log(JSON.stringify({ level: 'info', msg: 'Job completed', ...logFields, duration_ms: duration, status: 'completed' }));
        const event = COMPLETION_EVENTS[job.type];
        if (event) await this.emitEvent(job, event, { jobId: job.id, jobType: job.type, ...eventSummary(result) });
      } else {
        // The lease expired and the job was reclaimed; the newer execution owns the outcome.
        console.warn(JSON.stringify({ level: 'warn', msg: 'Job result discarded — execution no longer owns the job', ...logFields }));
      }
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);

      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      const errorCode = error instanceof JobError ? error.code : 'INTERNAL_ERROR';
      const retryable = error instanceof JobError ? error.retryable : false;

      console.error(JSON.stringify({
        level: 'error', msg: 'Job failed', ...logFields, attempt: job.attempts, maxAttempts: job.maxAttempts,
        error_code: errorCode, error: message, retryable, duration_ms: duration,
      }));

      try {
        const outcome = await withTransaction(async (client) => {
          const failed = await client.query(
            'SELECT rf_worker_fail_job($1, $2, $3, $4, $5, $6) AS outcome',
            [job.id, executionId, message, errorCode, retryable, duration],
          );
          return failed.rows[0].outcome as string;
        });
        console.log(JSON.stringify({ level: outcome === 'retrying' ? 'info' : 'warn', msg: `Job outcome: ${outcome}`, ...logFields, error_code: errorCode }));
        if (outcome === 'dead_letter' && job.type !== 'WEBHOOK_DELIVERY') {
          await this.emitEvent(job, 'job.failed', { jobId: job.id, jobType: job.type, errorCode });
          if (job.projectId) await this.notifyOwner(job, `کار ${job.type} ناموفق شد`, `اجرای کار ${job.type} پس از ${job.attempts} تلاش ناموفق شد. جزئیات در بخش اتوماسیون پروژه ثبت شده است.`);
        }
      } catch (e) {
        // The lease expiry recovers this job in rf_worker_claim_jobs.
        console.error(JSON.stringify({ level: 'error', msg: 'Failed to record job failure', ...logFields, error: e instanceof Error ? e.message : String(e) }));
      }
    }
  }

  /** A failed announcement must not change the outcome of the job it describes. */
  private async emitEvent(job: Job, event: string, data: Record<string, unknown>) {
    try {
      await withTransaction((client) => client.query('SELECT rf_worker_emit_event($1, $2, $3, $4)', [job.id, job.executionId, event, JSON.stringify(data)]));
    } catch (e) {
      console.error(JSON.stringify({ level: 'error', msg: 'Failed to emit webhook event', job_id: job.id, event, error: e instanceof Error ? e.message : String(e) }));
    }
  }

  /** Emails the organization owner. Without SMTP this is skipped: the in-app alert remains. */
  private async notifyOwner(job: Job, subject: string, text: string) {
    if (!process.env.SMTP_URL || !process.env.MAIL_FROM) return;
    try {
      const contact = await withTransaction((client) => client.query('SELECT email FROM rf_worker_owner_contact($1, $2)', [job.id, job.executionId]));
      const to = (contact as any).rows[0]?.email;
      if (!to) return;
      const smtp = new URL(process.env.SMTP_URL);
      const transport = nodemailer.createTransport({
        host: smtp.hostname,
        port: Number(smtp.port || (smtp.protocol === 'smtps:' ? 465 : 587)),
        secure: smtp.protocol === 'smtps:',
        ...(smtp.username ? { auth: { user: decodeURIComponent(smtp.username), pass: decodeURIComponent(smtp.password) } } : {}),
        connectionTimeout: 10000,
      });
      try {
        await transport.sendMail({ from: process.env.MAIL_FROM, to, subject: `سئویار: ${subject}`, text: `${text}\n\n${process.env.APP_URL || ''}` });
      } finally {
        transport.close();
      }
    } catch {
      // The address and SMTP credentials stay out of the log.
      console.error(JSON.stringify({ level: 'error', msg: 'Owner notification failed', job_id: job.id }));
    }
  }

  /** Charges before doing billable work. Idempotent per job; refunded if the job dead-letters. */
  private async chargeForJob(job: Job, executionId: string) {
    const outcome = await withTransaction(async (client) => {
      const charged = await client.query('SELECT rf_worker_charge_job($1, $2) AS outcome', [job.id, executionId]);
      return charged.rows[0].outcome as string;
    });
    if (outcome === 'insufficient' || outcome === 'no_wallet') {
      throw new JobError(`Insufficient credits to run ${job.type}`, 'INSUFFICIENT_CREDITS', false);
    }
    if (outcome === 'quota_exceeded') {
      throw new JobError(`Monthly plan quota reached for ${job.type}`, 'QUOTA_EXCEEDED', false);
    }
    if (outcome === 'lost') {
      throw new JobError('Execution no longer owns the job', 'RETRYABLE', true);
    }
  }

  private async executeJob(job: Job, signal: AbortSignal): Promise<any> {
    switch (job.type) {
      case 'SITE_CRAWL':
        return this.handleSiteCrawl(job, signal);
      case 'SEO_AUDIT':
      case 'AUDIT':
        return this.handleAudit(job, signal);
      case 'RANK_CHECK':
        return this.handleRankCheck(job, signal);
      case 'KEYWORD_REFRESH':
        return this.handleKeywordRefresh(job, signal);
      case 'BACKLINK_REFRESH':
      case 'BACKLINK_SYNC':
        return this.handleBacklinkRefresh(job, signal);
      case 'GSC_SYNC':
        return this.handleGscSync(job, signal);
      case 'GA4_SYNC':
        return this.handleGa4Sync(job, signal);
      case 'PAGESPEED_CHECK':
        return this.handlePagespeedCheck(job, signal);
      case 'COMPETITOR_CHECK':
        return this.handleCompetitorCheck(job, signal);
      case 'AI_VISIBILITY_CHECK':
        return this.handleAiVisibilityCheck(job, signal);
      case 'CONTENT_BRIEF':
        return this.handleContentBrief(job, signal);
      case 'FIX_SUGGESTIONS':
        return this.handleFixSuggestions(job, signal);
      case 'CONTENT_DRAFT':
        return this.handleContentDraft(job, signal);
      case 'BACKLINK_DISCOVERY':
        return this.handleBacklinkDiscovery(job, signal);
      case 'REPORT_GENERATION':
        return this.handleReportGeneration(job, signal);
      case 'ALERT_EVALUATION':
      case 'ALERT_PROCESSING':
        return this.handleAlertProcessing(job, signal);
      case 'WEBHOOK_DELIVERY':
        return this.handleWebhookDelivery(job);
      default:
        throw new JobError(`Unknown job type: ${job.type}`, 'VALIDATION_ERROR', false);
    }
  }

  // ============================================================
  // REAL SITE CRAWL PIPELINE
  // API → create crawl record → enqueue job → PG jobs → Worker claims → real crawler → persist → audit → score → update
  // ============================================================

  private async handleSiteCrawl(job: Job, signal: AbortSignal): Promise<any> {
    const domain = job.payload?.domain;
    const maxPages = Math.min(job.payload?.maxPages || 20, MAX_PAGES_PER_CRAWL);
    const maxDepth = Math.min(job.payload?.maxDepth || 2, MAX_CRAWL_DEPTH);
    const concurrency = Math.min(job.payload?.concurrency || 3, config.crawler.maxConcurrency);

    if (!domain) {
      throw new JobError('Domain missing in payload — VALIDATION_ERROR', 'VALIDATION_ERROR', false);
    }

    console.log(JSON.stringify({
      level: 'info',
      msg: 'Starting real crawl',
      job_id: job.id,
      domain,
      maxPages,
      maxDepth,
      organization_id: job.organizationId,
      project_id: job.projectId,
    }));

    // Validate domain not private
    await validateUrlForSSRF(`https://${domain}`);

    if (!job.projectId) {
      throw new JobError('Project missing for crawl — VALIDATION_ERROR', 'VALIDATION_ERROR', false);
    }
    // Project creation and schedules enqueue crawls without a run. Without one the
    // pages, findings and score had nowhere to go while the customer was still billed.
    const crawlRunId = await this.ensureCrawlRun(job, { maxPages, maxDepth, concurrency });

    const crawler = new Crawler({
      maxPages,
      maxDepth,
      concurrency,
      delay: config.crawler.delay,
      userAgent: config.crawler.userAgent,
      respectRobotsTxt: job.payload?.respectRobotsTxt ?? true,
      timeout: config.crawler.timeout,
      organizationId: job.organizationId,
      projectId: job.projectId || '',
      signal,
    });

    const crawlResult = await crawler.crawl(`https://${domain}`);

    if (signal.aborted) {
      throw new JobError('Crawl aborted due to timeout', 'TIMEOUT', true);
    }

    console.log(JSON.stringify({
      level: 'info',
      msg: 'Crawl completed',
      job_id: job.id,
      crawled: crawlResult.stats.crawled,
      failed: crawlResult.stats.failed,
      discovered: crawlResult.stats.totalDiscovered,
      duration_ms: crawlResult.stats.duration,
    }));

    if (crawlResult.pages.length === 0) {
      const reason = crawlResult.errors[0]?.error || 'no page could be fetched';
      if (reason.includes('SECURITY_ERROR')) throw new JobError(`Crawl blocked: ${reason}`, 'SECURITY_ERROR', false);
      throw new JobError(`Crawl produced no pages: ${reason}`, 'RETRYABLE', true);
    }

    const findings = runAudit({
      pages: crawlResult.pages,
      domain,
      sitemapUrls: crawlResult.sitemapUrls || [],
      robotsTxt: crawlResult.robotsTxt,
    });
    const score = calculateSeoScore(findings, crawlResult.pages.map((page) => page.url));

    // All-or-nothing: a database error fails the job and leaves the previous results.
    await withJobTransaction(async (client) => {
      for (const page of crawlResult.pages) {
        await client.query(
          `INSERT INTO crawl_pages (crawl_run_id, organization_id, project_id, url, normalized_url, status_code, content_type, title, meta_description, h1, word_count, response_time_ms, canonical_url, robots_directive, is_noindex, headers, links, images, structured_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
           ON CONFLICT (crawl_run_id, normalized_url) DO UPDATE SET
             status_code = EXCLUDED.status_code,
             title = EXCLUDED.title,
             meta_description = EXCLUDED.meta_description,
             h1 = EXCLUDED.h1,
             word_count = EXCLUDED.word_count,
             response_time_ms = EXCLUDED.response_time_ms`,
          [
            crawlRunId, job.organizationId, job.projectId, page.url, page.normalizedUrl, page.statusCode, page.contentType,
            page.title, page.metaDescription, page.h1, page.wordCount, page.responseTime, page.canonical, page.robotsMeta,
            !page.isIndexable, JSON.stringify(page.headers || {}), JSON.stringify(page.links || []),
            JSON.stringify(page.images || []), JSON.stringify(page.structuredData || []),
          ],
        );
      }

      // Rebuild this run's findings so a retry cannot duplicate them.
      await client.query(`DELETE FROM audit_findings WHERE crawl_run_id = $1 AND organization_id = $2`, [crawlRunId, job.organizationId]);
      await client.query(`DELETE FROM crawl_issues WHERE crawl_run_id = $1 AND organization_id = $2`, [crawlRunId, job.organizationId]);
      for (const finding of findings) {
        await client.query(
          `INSERT INTO audit_findings (organization_id, project_id, crawl_run_id, rule_id, severity, category, title, description, evidence, affected_urls, recommendation, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'open')`,
          [job.organizationId, job.projectId, crawlRunId, finding.ruleId, finding.severity, finding.category, finding.title,
            finding.description, JSON.stringify(finding.evidence || {}), finding.affectedUrls || [], finding.recommendation],
        );
        await client.query(
          `INSERT INTO crawl_issues (crawl_run_id, organization_id, project_id, rule_id, severity, category, url, title, description, recommendation, evidence, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'open')`,
          [crawlRunId, job.organizationId, job.projectId, finding.ruleId, finding.severity, finding.category,
            finding.affectedUrls[0] || `https://${domain}`, finding.title, finding.description, finding.recommendation,
            JSON.stringify(finding.evidence || {})],
        );
      }

      await client.query(
        `UPDATE projects SET seo_score = $2, last_crawl_at = NOW(), updated_at = NOW() WHERE id = $1 AND organization_id = $3`,
        [job.projectId, score.overall, job.organizationId],
      );
      await client.query(
        `UPDATE crawl_runs SET status = 'completed', total_pages = $2, crawled_pages = $3, failed_pages = $4, completed_at = NOW() WHERE id = $1 AND organization_id = $5`,
        [crawlRunId, crawlResult.stats.totalDiscovered, crawlResult.stats.crawled, crawlResult.stats.failed, job.organizationId],
      );
    });

    console.log(JSON.stringify({ level: 'info', msg: 'Crawl persisted', job_id: job.id, pages: crawlResult.pages.length, findings: findings.length, score: score.overall }));

    return {
      crawlRunId,
      stats: crawlResult.stats,
      pagesCrawled: crawlResult.pages.length,
      findingsCount: findings.length,
      seoScore: score.overall,
      categories: score.categories,
    };
  }

  /** Reuses the run named in the payload, or the one an earlier attempt of this job made. */
  private async ensureCrawlRun(job: Job, options: { maxPages: number; maxDepth: number; concurrency: number }): Promise<string> {
    const runConfig = JSON.stringify({ ...options, jobId: job.id });
    return withJobTransaction(async (client) => {
      let runId: string | undefined = job.payload?.crawlRunId;
      if (!runId) {
        const existing = await client.query(`SELECT id FROM crawl_runs WHERE organization_id = $1 AND config->>'jobId' = $2`, [job.organizationId, job.id]);
        runId = existing.rows[0]?.id;
      }
      if (runId) {
        const updated = await client.query(
          `UPDATE crawl_runs SET status = 'running', started_at = NOW(), config = $2 WHERE id = $1 AND organization_id = $3 AND project_id = $4`,
          [runId, runConfig, job.organizationId, job.projectId],
        );
        if (updated.rowCount === 0) throw new JobError('Crawl run not found for this project', 'VALIDATION_ERROR', false);
        return runId;
      }
      const created = await client.query(
        `INSERT INTO crawl_runs (organization_id, project_id, status, started_at, config) VALUES ($1, $2, 'running', NOW(), $3) RETURNING id`,
        [job.organizationId, job.projectId, runConfig],
      );
      return created.rows[0].id as string;
    });
  }

  private async handleAudit(job: Job, signal: AbortSignal): Promise<any> {
    console.log(JSON.stringify({ level: 'info', msg: 'Running audit', job_id: job.id, project_id: job.projectId }));
    
    if (signal.aborted) throw new JobError('Audit aborted', 'TIMEOUT', true);

    // Fetch latest crawl run
    const crawlRunResult = await query(
      `SELECT id FROM crawl_runs WHERE project_id = $1 AND organization_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [job.projectId, job.organizationId]
    );

    if (crawlRunResult.rows.length === 0) {
      throw new JobError('No crawl run found for audit — VALIDATION_ERROR', 'VALIDATION_ERROR', false);
    }

    const crawlRunId = crawlRunResult.rows[0].id;

    // Fetch pages
    const pagesResult = await query(
      `SELECT url, normalized_url as "normalizedUrl", status_code as "statusCode", title, meta_description as "metaDescription", h1, word_count as "wordCount", response_time_ms as "responseTime", content_type as "contentType", canonical_url as "canonical", robots_directive as "robotsMeta", is_noindex as "isNoindex", headers, links, images, structured_data as "structuredData"
       FROM crawl_pages WHERE crawl_run_id = $1 AND organization_id = $2`,
      [crawlRunId, job.organizationId]
    );

    if (pagesResult.rows.length === 0) {
      throw new JobError('No pages found for audit', 'VALIDATION_ERROR', false);
    }

    // Convert to CrawlPage format
    const pages: CrawlPage[] = pagesResult.rows.map((row: any) => ({
      url: row.url,
      normalizedUrl: row.normalizedUrl || row.url,
      statusCode: row.statusCode || 200,
      title: row.title,
      metaDescription: row.metaDescription,
      h1: row.h1,
      h2: [],
      h3: [],
      wordCount: row.wordCount || 0,
      responseTime: row.responseTime || 0,
      isIndexable: !row.isNoindex,
      canonical: row.canonical,
      robotsMeta: row.robotsMeta,
      hreflang: [],
      structuredData: row.structuredData ? (typeof row.structuredData === 'string' ? JSON.parse(row.structuredData) : row.structuredData) : [],
      images: row.images ? (typeof row.images === 'string' ? JSON.parse(row.images) : row.images) : [],
      links: row.links ? (typeof row.links === 'string' ? JSON.parse(row.links) : row.links) : [],
      headers: row.headers ? (typeof row.headers === 'string' ? JSON.parse(row.headers) : row.headers) : {},
      depth: 0,
    }));

    const projectResult = await query(`SELECT normalized_domain FROM projects WHERE id = $1 AND organization_id = $2`, [job.projectId, job.organizationId]);
    const domain = projectResult.rows[0]?.normalized_domain || 'unknown';

    const findings = runAudit({
      pages,
      domain,
      sitemapUrls: [],
      robotsTxt: undefined,
    });

    const score = calculateSeoScore(findings, pages.map((page) => page.url));

    // Atomic rebuild, so a failed insert cannot leave the run with no findings.
    await withJobTransaction(async (client) => {
      await client.query(`DELETE FROM audit_findings WHERE crawl_run_id = $1 AND organization_id = $2`, [crawlRunId, job.organizationId]);
      for (const finding of findings) {
        await client.query(
          `INSERT INTO audit_findings (organization_id, project_id, crawl_run_id, rule_id, severity, category, title, description, evidence, affected_urls, recommendation, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'open')`,
          [job.organizationId, job.projectId, crawlRunId, finding.ruleId, finding.severity, finding.category, finding.title, finding.description, JSON.stringify(finding.evidence), finding.affectedUrls, finding.recommendation],
        );
      }
      await client.query(`UPDATE projects SET seo_score = $2, updated_at = NOW() WHERE id = $1 AND organization_id = $3`, [job.projectId, score.overall, job.organizationId]);
    });

    return { findingsCount: findings.length, seoScore: score.overall, crawlRunId };
  }

  private async handleRankCheck(job: Job, signal: AbortSignal): Promise<any> {
    console.log(JSON.stringify({ level: 'info', msg: 'Rank check', job_id: job.id, project_id: job.projectId }));

    // DataForSEO first, else a SerpApi-format service. No credentials → PROVIDER_NOT_CONFIGURED, no fake rankings.
    const client = createDataForSeoClient();
    const serpApi = createSerpApiClient();
    const kwRank = createKwRankClient();
    if (!client.isConfigured() && !serpApi.isConfigured() && !kwRank.isConfigured()) {
      throw new JobError('Rank check provider not configured — set DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD, SERPAPI_KEY or KWRANK_CLIENT_ID/KWRANK_CLIENT_SECRET — PROVIDER_NOT_CONFIGURED', 'PROVIDER_NOT_CONFIGURED', false);
    }
    const providerName = client.isConfigured() ? 'dataforseo' : serpApi.isConfigured() ? 'serpapi' : 'kwrank';
    // DataForSEO bills per 100 positions, so it always fetches 100; SerpApi bills per page of 10.
    const depth = providerName === 'dataforseo' ? 100 : rankDepth();
    let searches = 0;

    if (signal.aborted) throw new JobError('Rank check aborted', 'TIMEOUT', true);
    if (!job.projectId) throw new JobError('Project missing for rank check — VALIDATION_ERROR', 'VALIDATION_ERROR', false);

    const projectResult = await query(
      `SELECT id, domain, normalized_domain, country, language, device FROM projects WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [job.projectId, job.organizationId]
    );
    if (projectResult.rows.length === 0) {
      throw new JobError(`Project not found for rank check: ${job.projectId}`, 'NON_RETRYABLE', false);
    }
    const project = projectResult.rows[0];

    // Location + language come from the project's own configuration.
    const country = (project.country || 'US').toUpperCase();
    const locationCode = resolveDataForSeoLocationCode(country);
    const languageCode = resolveDataForSeoLanguageCode(project.language);
    // projects.device is 'desktop' | 'mobile' | 'both' — 'both' tracks desktop here.
    const device: 'desktop' | 'mobile' = project.device === 'mobile' ? 'mobile' : 'desktop';
    const targetDomain = project.normalized_domain || project.domain;

    const keywordResult = await query(
      `SELECT id, COALESCE(keyword, term) AS term FROM keywords WHERE project_id = $1 AND organization_id = $2 ORDER BY created_at ASC`,
      [project.id, job.organizationId]
    );

    if (keywordResult.rows.length === 0) {
      console.log(JSON.stringify({ level: 'info', msg: 'Rank check — no tracked keywords', job_id: job.id, project_id: project.id }));
      return { keywordsChecked: 0, ranked: 0, notRanked: 0, provider: providerName, message: 'No tracked keywords for project — nothing to check' };
    }

    if (providerName === 'kwrank') {
      try {
        return await this.syncKwRank(kwRank, job, project, keywordResult.rows, country, languageCode, signal);
      } catch (error) {
        throw providerErrorToJobError(error, 'KWRank request');
      }
    }

    let ranked = 0;
    let notRanked = 0;

    for (const kw of keywordResult.rows) {
      if (signal.aborted) throw new JobError('Rank check aborted', 'TIMEOUT', true);

      let serp;
      try {
        if (providerName === 'dataforseo') {
          serp = await client.searchSerp(kw.term, { locationCode, languageCode, device });
          searches++;
        } else {
          const outcome = await serpApi.searchSerp(kw.term, { country, language: languageCode, device, depth, targetDomain });
          searches += outcome.requests;
          serp = outcome;
        }
      } catch (error) {
        throw providerErrorToJobError(error, providerName === 'dataforseo' ? 'DataForSEO SERP request' : 'SerpApi SERP request');
      }

      const hit = findDomainPosition(serp.results, targetDomain);

      await persistRankResult(query, {
        organizationId: job.organizationId,
        projectId: project.id,
        keywordId: kw.id,
        position: hit ? hit.position : null,
        url: hit ? hit.url : null,
        country,
        language: languageCode,
        device,
        engine: 'google',
        provider: providerName,
        rawData: {
          requestId: serp.requestId,
          totalResults: serp.totalResults,
          serpFeatures: serp.serpFeatures,
          locationCode,
          provider: providerName,
          depth,
          checkedAt: new Date().toISOString(),
        },
      });

      if (hit) ranked++;
      else notRanked++;
    }

    console.log(JSON.stringify({
      level: 'info', msg: 'Rank check completed', job_id: job.id, project_id: project.id,
      keywordsChecked: keywordResult.rows.length, ranked, notRanked, locationCode, languageCode, device,
    }));

    return {
      keywordsChecked: keywordResult.rows.length,
      ranked,
      notRanked,
      locationCode,
      languageCode,
      device,
      depth,
      searches,
      provider: providerName,
    };
  }

  /**
   * KWRank checks positions on its own schedule: keep the domain and keywords registered there
   * and store the latest position it has for each keyword. A keyword KWRank has not checked yet
   * is left without a result rather than recorded as "not ranked".
   */
  private async syncKwRank(
    kwRank: KwRankClient, job: Job, project: any, keywords: { id: string; term: string }[],
    country: string, languageCode: string, signal: AbortSignal,
  ): Promise<any> {
    const countryId = KWRANK_COUNTRY_IDS[country];
    if (!countryId) throw new JobError(`KWRank does not track Google for country ${country} — VALIDATION_ERROR`, 'VALIDATION_ERROR', false);
    const device = kwRankDevice(project.device);
    const storedDevice = device === 'desktop' ? 'desktop' : 'mobile';
    const domain = await kwRank.ensureDomain(project.normalized_domain || project.domain);
    let remote = await kwRank.listKeywords(domain.id);
    let { matched, missing, otherDevice } = matchKwRankKeywords(keywords, remote, device);
    const shapeBefore = kwRank.lastListShape;
    let added = 0;
    if (missing.length) {
      if (signal.aborted) throw new JobError('Rank check aborted', 'TIMEOUT', true);
      added = await kwRank.addKeywords(domain.id, missing.map((k) => k.term), countryId, device);
      remote = await kwRank.listKeywords(domain.id);
      ({ matched, missing, otherDevice } = matchKwRankKeywords(keywords, remote, device));
    }
    let ranked = 0;
    let notRanked = 0;
    let waiting = 0;
    let volumes = 0;
    for (const { keywordId, remote: r } of matched) {
      // Monthly searches come from Google Keyword Planner through KWRank, often before the first rank check.
      const competition = KWRANK_COMPETITION[r.competition ?? ''] ?? null;
      if (r.averageMonthlySearches !== null || competition !== null) {
        // The worker may write these columns but not read them, so only known values are set.
        const sets: string[] = [];
        const values: unknown[] = [keywordId];
        if (r.averageMonthlySearches !== null) { values.push(r.averageMonthlySearches); sets.push(`search_volume = $${values.length}`, `volume = $${values.length}`); }
        if (competition !== null) { values.push(competition); sets.push(`competition = $${values.length}`); }
        await query(`UPDATE keywords SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, values);
        volumes++;
      }
      if (!r.checked) { waiting++; continue; }
      await persistRankResult(query, {
        organizationId: job.organizationId, projectId: project.id, keywordId,
        position: r.rank, url: r.rank ? r.url : null, country, language: languageCode, device: storedDevice,
        engine: 'google', provider: 'kwrank',
        rawData: { kwrankDomainId: domain.id, kwrankKeywordId: r.id, rankUpdatedAt: r.rankUpdatedAt, depth: 100, checkedAt: new Date().toISOString() },
      });
      if (r.rank) ranked++;
      else notRanked++;
    }
    console.log(JSON.stringify({ level: 'info', msg: 'KWRank sync completed', job_id: job.id, project_id: project.id,
      domainId: domain.id, domainCreated: domain.created, added, ranked, notRanked, waiting, unmatched: missing.length,
      otherDevice: otherDevice.length, wantedDevice: device, listBefore: shapeBefore, listAfter: kwRank.lastListShape }));
    return {
      keywordsChecked: ranked + notRanked, ranked, notRanked, waiting, added, volumes, unmatched: missing.length, otherDevice: otherDevice.length,
      device: storedDevice, depth: 100, provider: 'kwrank', domainInactive: !domain.active,
    };
  }

  private async handleKeywordRefresh(job: Job, signal: AbortSignal): Promise<any> {
    console.log(JSON.stringify({ level: 'info', msg: 'Keyword refresh', job_id: job.id, project_id: job.projectId }));

    // No credentials → graceful PROVIDER_NOT_CONFIGURED, no fake keyword metrics.
    const client = createDataForSeoClient();
    if (!client.isConfigured()) {
      throw new JobError('Keyword provider not configured — DataForSEO credentials missing (set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD) — PROVIDER_NOT_CONFIGURED', 'PROVIDER_NOT_CONFIGURED', false);
    }

    if (signal.aborted) throw new JobError('Keyword refresh aborted', 'TIMEOUT', true);
    if (!job.projectId) throw new JobError('Project missing for keyword refresh — VALIDATION_ERROR', 'VALIDATION_ERROR', false);

    const projectResult = await query(
      `SELECT id, country, language FROM projects WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [job.projectId, job.organizationId]
    );
    if (projectResult.rows.length === 0) {
      throw new JobError(`Project not found for keyword refresh: ${job.projectId}`, 'NON_RETRYABLE', false);
    }
    const project = projectResult.rows[0];

    const country = (project.country || 'US').toUpperCase();
    const locationCode = resolveDataForSeoLocationCode(country);
    const languageCode = resolveDataForSeoLanguageCode(project.language);

    const keywordResult = await query(
      `SELECT id, COALESCE(keyword, term) AS term FROM keywords WHERE project_id = $1 AND organization_id = $2 ORDER BY created_at ASC`,
      [project.id, job.organizationId]
    );

    if (keywordResult.rows.length === 0) {
      console.log(JSON.stringify({ level: 'info', msg: 'Keyword refresh — no tracked keywords', job_id: job.id, project_id: project.id }));
      return { tracked: 0, updated: 0, notReturned: 0, provider: 'dataforseo', message: 'No tracked keywords for project — nothing to refresh' };
    }

    // The provider's related-keywords endpoint takes the tracked terms
    // as seeds and returns metrics for them and their close variants;
    // persistence applies ONLY exact normalized matches (see
    // persistKeywordMetrics) — unmatched tracked keywords keep their
    // existing values rather than receiving invented ones.
    const seeds = keywordResult.rows.map((r: any) => r.term).filter(Boolean);
    let metrics;
    try {
      metrics = await client.getKeywordData(seeds, { locationCode, languageCode, limit: 100 });
    } catch (error) {
      throw providerErrorToJobError(error, 'DataForSEO keyword data request');
    }

    const stats = await persistKeywordMetrics(query, {
      organizationId: job.organizationId,
      projectId: project.id,
      metrics,
    });

    console.log(JSON.stringify({
      level: 'info', msg: 'Keyword refresh completed', job_id: job.id, project_id: project.id,
      tracked: keywordResult.rows.length, locationCode, languageCode, ...stats,
    }));

    return {
      tracked: keywordResult.rows.length,
      ...stats,
      locationCode,
      languageCode,
      provider: 'dataforseo',
    };
  }

  private async handleBacklinkRefresh(job: Job, signal: AbortSignal): Promise<any> {
    console.log(JSON.stringify({ level: 'info', msg: 'Backlink refresh', job_id: job.id, domain: job.payload?.domain }));

    // No credentials → graceful PROVIDER_NOT_CONFIGURED, no fake backlinks (unchanged contract).
    const client = createDataForSeoClient();
    if (!client.isConfigured()) {
      throw new JobError('Backlink provider not configured — DataForSEO credentials missing (set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD) — PROVIDER_NOT_CONFIGURED', 'PROVIDER_NOT_CONFIGURED', false);
    }

    if (signal.aborted) throw new JobError('Backlink refresh aborted', 'TIMEOUT', true);
    if (!job.projectId) throw new JobError('Project missing for backlink sync — VALIDATION_ERROR', 'VALIDATION_ERROR', false);

    let domain: string | undefined = job.payload?.domain;
    if (!domain) {
      const projectResult = await query(
        `SELECT normalized_domain, domain FROM projects WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [job.projectId, job.organizationId]
      );
      if (projectResult.rows.length === 0) {
        throw new JobError(`Project not found for backlink sync: ${job.projectId}`, 'NON_RETRYABLE', false);
      }
      domain = projectResult.rows[0].normalized_domain || projectResult.rows[0].domain;
    }
    if (!domain) throw new JobError('Domain missing for backlink sync — VALIDATION_ERROR', 'VALIDATION_ERROR', false);

    const syncStartedAt = new Date();

    let backlinks;
    try {
      backlinks = await client.getBacklinks(domain);
    } catch (error) {
      throw providerErrorToJobError(error, 'DataForSEO backlinks request');
    }

    const stats = await persistBacklinkSync(query, {
      organizationId: job.organizationId,
      projectId: job.projectId,
      backlinks,
      syncStartedAt,
    });

    console.log(JSON.stringify({
      level: 'info', msg: 'Backlink sync completed', job_id: job.id, project_id: job.projectId, domain, ...stats,
    }));

    return { domain, provider: 'dataforseo', ...stats };
  }

  private async handleGscSync(job: Job, signal: AbortSignal): Promise<any> {
    console.log(JSON.stringify({ level: 'info', msg: 'GSC sync', job_id: job.id, project_id: job.projectId }));

    // No OAuth app credentials → graceful PROVIDER_NOT_CONFIGURED (unchanged contract).
    const client = createGoogleClient();
    if (!client.isConfigured()) {
      throw new JobError('GSC not configured — Google OAuth app credentials missing (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) — PROVIDER_NOT_CONFIGURED', 'PROVIDER_NOT_CONFIGURED', false);
    }

    if (signal.aborted) throw new JobError('GSC sync aborted', 'TIMEOUT', true);
    if (!job.projectId) throw new JobError('Project missing for GSC sync — VALIDATION_ERROR', 'VALIDATION_ERROR', false);

    const integrationResult = await query(
      `SELECT id, status, credentials_encrypted as "credentialsEncrypted", config FROM integrations WHERE organization_id = $1 AND project_id = $2 AND provider = 'gsc'`,
      [job.organizationId, job.projectId]
    );

    if (integrationResult.rows.length === 0 || integrationResult.rows[0].status !== 'connected') {
      throw new JobError('GSC integration not connected — PROVIDER_NOT_CONFIGURED', 'PROVIDER_NOT_CONFIGURED', false);
    }
    const integration = integrationResult.rows[0];

    const siteUrl: string | undefined = integration.config?.siteUrl;
    if (!siteUrl) {
      throw new JobError('GSC property not selected for this project — bind a Search Console site first — VALIDATION_ERROR', 'VALIDATION_ERROR', false);
    }

    const fallbackWindow = defaultGscWindow();
    const window = {
      startDate: job.payload?.startDate || fallbackWindow.startDate,
      endDate: job.payload?.endDate || fallbackWindow.endDate,
    };

    // Stored token (decrypted), refreshed + persisted when stale.
    let accessToken: string;
    try {
      accessToken = await ensureValidAccessToken(query, integration, client);
    } catch (error) {
      if (error instanceof GoogleApiError && (error.providerError === 'invalid_grant' || error.providerError === 'no_refresh_token' || error.providerError === 'no_credentials')) {
        await markIntegrationError(query, integration.id, error.message);
      }
      throw googleErrorToJobError(error, 'GSC sync');
    }

    let rows;
    try {
      const json = await client.querySearchAnalytics(accessToken, siteUrl, buildGscRequestBody(window));
      rows = mapGscSearchAnalyticsResponse(json);
    } catch (error) {
      throw googleErrorToJobError(error, 'GSC Search Analytics request');
    }

    const stats = await persistGscMetrics(query, {
      organizationId: job.organizationId,
      projectId: job.projectId,
      rows,
    });
    await markIntegrationSyncSuccess(query, integration.id);

    const projectRow = await query(`SELECT country, language FROM projects WHERE id = $1 AND organization_id = $2`, [job.projectId, job.organizationId]);
    const ranks = await persistRanksFromGsc(query, {
      organizationId: job.organizationId,
      projectId: job.projectId,
      country: String(projectRow.rows[0]?.country || 'IR').toUpperCase(),
      language: projectRow.rows[0]?.language || 'fa',
    });

    console.log(JSON.stringify({
      level: 'info', msg: 'GSC sync completed', ranksUpdated: ranks.updated, job_id: job.id, project_id: job.projectId, siteUrl, window, ...stats,
    }));

    return { siteUrl, provider: 'gsc', window, ranksUpdated: ranks.updated, ...stats };
  }

  private async handleGa4Sync(job: Job, signal: AbortSignal): Promise<any> {
    console.log(JSON.stringify({ level: 'info', msg: 'GA4 sync', job_id: job.id, project_id: job.projectId }));

    // No OAuth app credentials → graceful PROVIDER_NOT_CONFIGURED (unchanged contract).
    const client = createGoogleClient();
    if (!client.isConfigured()) {
      throw new JobError('GA4 not configured — Google OAuth app credentials missing (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) — PROVIDER_NOT_CONFIGURED', 'PROVIDER_NOT_CONFIGURED', false);
    }

    if (signal.aborted) throw new JobError('GA4 sync aborted', 'TIMEOUT', true);
    if (!job.projectId) throw new JobError('Project missing for GA4 sync — VALIDATION_ERROR', 'VALIDATION_ERROR', false);

    const integrationResult = await query(
      `SELECT id, status, credentials_encrypted as "credentialsEncrypted", config FROM integrations WHERE organization_id = $1 AND project_id = $2 AND provider = 'ga4'`,
      [job.organizationId, job.projectId]
    );

    if (integrationResult.rows.length === 0 || integrationResult.rows[0].status !== 'connected') {
      throw new JobError('GA4 integration not connected — PROVIDER_NOT_CONFIGURED', 'PROVIDER_NOT_CONFIGURED', false);
    }
    const integration = integrationResult.rows[0];

    const propertyId: string | undefined = integration.config?.propertyId;
    if (!propertyId) {
      throw new JobError('GA4 property not selected for this project — bind a GA4 property first — VALIDATION_ERROR', 'VALIDATION_ERROR', false);
    }

    const fallbackWindow = defaultGa4Window();
    const window = {
      startDate: job.payload?.startDate || fallbackWindow.startDate,
      endDate: job.payload?.endDate || fallbackWindow.endDate,
    };

    // Stored token (decrypted), refreshed + persisted when stale.
    let accessToken: string;
    try {
      accessToken = await ensureValidAccessToken(query, integration, client);
    } catch (error) {
      if (error instanceof GoogleApiError && (error.providerError === 'invalid_grant' || error.providerError === 'no_refresh_token' || error.providerError === 'no_credentials')) {
        await markIntegrationError(query, integration.id, error.message);
      }
      throw googleErrorToJobError(error, 'GA4 sync');
    }

    let rows;
    try {
      const json = await client.runGa4Report(accessToken, propertyId, buildGa4RequestBody(window));
      rows = mapGa4ReportResponse(json);
    } catch (error) {
      throw googleErrorToJobError(error, 'GA4 Data API request');
    }

    const stats = await persistGa4Metrics(query, {
      organizationId: job.organizationId,
      projectId: job.projectId,
      rows,
    });
    await markIntegrationSyncSuccess(query, integration.id);

    console.log(JSON.stringify({
      level: 'info', msg: 'GA4 sync completed', job_id: job.id, project_id: job.projectId, propertyId, window, ...stats,
    }));

    return { propertyId, provider: 'ga4', window, ...stats };
  }

  private async handlePagespeedCheck(job: Job, signal: AbortSignal): Promise<any> {
    console.log(JSON.stringify({ level: 'info', msg: 'PageSpeed check', job_id: job.id, url: job.payload?.url }));

    const url = job.payload?.url;
    if (!url) throw new JobError('URL missing for PageSpeed check', 'VALIDATION_ERROR', false);

    if (!config.providers.pagespeed) {
      throw new JobError('PageSpeed not configured — PROVIDER_NOT_CONFIGURED', 'PROVIDER_NOT_CONFIGURED', false);
    }

    if (signal.aborted) throw new JobError('PageSpeed check aborted', 'TIMEOUT', true);

    // Real PageSpeed API call
    try {
      await validateUrlForSSRF(url);
      const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${config.providers.pagespeed}&strategy=mobile`;
      
      const res = await safeFetch(apiUrl, { timeout: 30000, signal });
      if (!res.ok) {
        throw new JobError(`PageSpeed API failed: ${res.status}`, 'RETRYABLE', true);
      }

      const data: any = await res.json();
      const lighthouse = data.lighthouseResult;
      const audits = lighthouse?.audits;

      const result = {
        url,
        performance_score: Math.round((lighthouse?.categories?.performance?.score || 0) * 100),
        accessibility_score: Math.round((lighthouse?.categories?.accessibility?.score || 0) * 100),
        best_practices_score: Math.round((lighthouse?.categories?.['best-practices']?.score || 0) * 100),
        seo_score: Math.round((lighthouse?.categories?.seo?.score || 0) * 100),
        lcp: audits?.['largest-contentful-paint']?.numericValue,
        cls: audits?.['cumulative-layout-shift']?.numericValue,
        inp: audits?.['interaction-to-next-paint']?.numericValue || audits?.['experimental-interaction-to-next-paint']?.numericValue,
      };

      // Persist
      await query(
        `INSERT INTO pagespeed_results (organization_id, project_id, url, strategy, performance_score, accessibility_score, best_practices_score, seo_score, lcp, cls, inp, raw_data)
         VALUES ($1, $2, $3, 'mobile', $4, $5, $6, $7, $8, $9, $10, $11)`,
        [job.organizationId, job.projectId, url, result.performance_score, result.accessibility_score, result.best_practices_score, result.seo_score, result.lcp, result.cls, result.inp, JSON.stringify(data)]
      );

      return result;
    } catch (error) {
      if (error instanceof JobError) throw error;
      throw new JobError(`PageSpeed check failed: ${error instanceof Error ? error.message : String(error)}`, 'RETRYABLE', true);
    }
  }

  private async handleCompetitorCheck(job: Job, signal: AbortSignal): Promise<any> {
    console.log(JSON.stringify({ level: 'info', msg: 'Competitor check', job_id: job.id, project_id: job.projectId }));

    if (signal.aborted) throw new JobError('Competitor check aborted', 'TIMEOUT', true);
    if (!job.projectId) throw new JobError('Project missing for competitor check — VALIDATION_ERROR', 'VALIDATION_ERROR', false);

    const client = createDataForSeoClient();

    if (!client.isConfigured()) {
      // No provider → manual competitors only (unchanged contract):
      // succeed with the manual list when one exists, else fail honestly.
      const projectResult = await query(`SELECT competitors FROM projects WHERE id = $1 AND organization_id = $2`, [job.projectId, job.organizationId]);
      const competitors = projectResult.rows[0]?.competitors || [];
      if (competitors.length === 0) {
        throw new JobError('Competitor provider not configured and no manual competitors — PROVIDER_NOT_CONFIGURED', 'PROVIDER_NOT_CONFIGURED', false);
      }
      return { competitors, source: 'manual', message: 'Manual competitors only, no provider discovery' };
    }

    const projectResult = await query(
      `SELECT id, domain, normalized_domain, country, language FROM projects WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [job.projectId, job.organizationId]
    );
    if (projectResult.rows.length === 0) {
      throw new JobError(`Project not found for competitor check: ${job.projectId}`, 'NON_RETRYABLE', false);
    }
    const project = projectResult.rows[0];
    const targetDomain = project.normalized_domain || project.domain;
    const country = (project.country || 'US').toUpperCase();
    const locationCode = resolveDataForSeoLocationCode(country);
    const languageCode = resolveDataForSeoLanguageCode(project.language);

    let discovered;
    try {
      discovered = await client.getCompetitorDomains(targetDomain, { locationCode, languageCode, limit: 20 });
    } catch (error) {
      throw providerErrorToJobError(error, 'DataForSEO competitors request');
    }

    const stats = await persistCompetitorDiscovery(query, {
      organizationId: job.organizationId,
      projectId: project.id,
      ownDomain: targetDomain,
      competitors: discovered,
    });

    console.log(JSON.stringify({
      level: 'info', msg: 'Competitor discovery completed', job_id: job.id, project_id: project.id,
      domain: targetDomain, locationCode, languageCode, ...stats,
    }));

    return {
      domain: targetDomain,
      source: 'provider',
      provider: 'dataforseo',
      locationCode,
      languageCode,
      competitors: discovered.map((c) => c.domain),
      ...stats,
    };
  }

  private async handleAiVisibilityCheck(job: Job, signal: AbortSignal): Promise<any> {
    console.log(JSON.stringify({ level: 'info', msg: 'AI visibility check', job_id: job.id, project_id: job.projectId }));

    // No AI provider → graceful PROVIDER_NOT_CONFIGURED, no fabricated visibility.
    const aiProviders = createWorkerAiProviders();
    let provider = pickAiProvider(aiProviders, job.payload?.provider);
    if (!provider) {
      throw new JobError(AI_NOT_CONFIGURED_MESSAGE, 'PROVIDER_NOT_CONFIGURED', false);
    }

    if (signal.aborted) throw new JobError('AI visibility check aborted', 'TIMEOUT', true);
    if (!job.projectId) throw new JobError('Project missing for AI visibility check — VALIDATION_ERROR', 'VALIDATION_ERROR', false);

    const projectResult = await query(
      `SELECT id, name, domain, normalized_domain, competitors FROM projects WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [job.projectId, job.organizationId]
    );
    if (projectResult.rows.length === 0) {
      throw new JobError(`Project not found for AI visibility check: ${job.projectId}`, 'NON_RETRYABLE', false);
    }
    const project = projectResult.rows[0];
    const targetDomain = project.normalized_domain || project.domain;

    // Competitor set for mention analysis: the discovered/manual
    // competitors table plus the project's own competitors list.
    const competitorRows = await query(
      `SELECT normalized_domain FROM competitors WHERE project_id = $1 AND organization_id = $2`,
      [project.id, job.organizationId]
    );
    const competitorDomains = Array.from(new Set([
      ...competitorRows.rows.map((r: any) => r.normalized_domain),
      ...((project.competitors || []) as string[]),
    ].filter(Boolean)));

    const prompt = job.payload?.prompt || `What is ${project.domain}?`;

    let ai;
    try {
      ({ ai, provider } = await completeWithFallback(aiProviders, job.payload?.provider, prompt, { maxTokens: 800, temperature: 0.2 }));
    } catch (error) {
      throw aiErrorToJobError(error, `${provider.name} visibility request`);
    }
    if (signal.aborted) throw new JobError('AI visibility check aborted', 'TIMEOUT', true);

    const analysis = analyzeGeoResponse(ai.content, {
      domain: targetDomain,
      projectName: project.name,
      competitorDomains,
    });
    const engine = aiEngineForProvider(provider.name);

    const runResult = await query(
      `INSERT INTO geo_runs (project_id, organization_id, ai_engine, prompt, response, brand_mentioned, brand_position, cited_urls, competitor_mentions, visibility_score, cost, provider, model, raw_response)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        project.id,
        job.organizationId,
        engine,
        prompt,
        ai.content,
        analysis.brandMentioned,
        analysis.brandPosition,
        analysis.citedUrls,
        JSON.stringify(analysis.competitorMentions),
        analysis.visibilityScore,
        ai.estimatedCostUsd,
        ai.provider,
        ai.model,
        JSON.stringify({
          content: ai.content,
          requestId: ai.requestId || null,
          latencyMs: ai.latencyMs,
          usage: { inputTokens: ai.inputTokens, outputTokens: ai.outputTokens },
        }),
      ]
    );

    await recordAiUsage(query, {
      organizationId: job.organizationId,
      projectId: project.id,
      provider: ai.provider,
      model: ai.model,
      inputTokens: ai.inputTokens,
      outputTokens: ai.outputTokens,
      estimatedCostUsd: ai.estimatedCostUsd,
      operation: 'geo_visibility_check',
      idempotencyKey: `geo_${job.id}`,
      referenceType: 'geo_run',
      referenceId: runResult.rows[0].id,
    });

    console.log(JSON.stringify({
      level: 'info', msg: 'AI visibility check completed', job_id: job.id, project_id: project.id,
      provider: ai.provider, model: ai.model, brandMentioned: analysis.brandMentioned,
      brandPosition: analysis.brandPosition, citedUrls: analysis.citedUrls.length,
      visibilityScore: analysis.visibilityScore, costUsd: ai.estimatedCostUsd,
    }));

    return {
      geoRunId: runResult.rows[0].id,
      provider: ai.provider,
      model: ai.model,
      engine,
      brandMentioned: analysis.brandMentioned,
      brandPosition: analysis.brandPosition,
      citedUrls: analysis.citedUrls.length,
      competitorMentions: analysis.competitorMentions,
      visibilityScore: analysis.visibilityScore,
      estimatedCostUsd: ai.estimatedCostUsd,
    };
  }

  private async handleFixSuggestions(job: Job, signal: AbortSignal): Promise<any> {
    if (!job.projectId) throw new JobError('Project missing for fix suggestions — VALIDATION_ERROR', 'VALIDATION_ERROR', false);
    const aiProviders = createWorkerAiProviders();
    let provider = pickAiProvider(aiProviders, job.payload?.provider);

    const project = (await query(
      `SELECT id, domain, normalized_domain, language FROM projects WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [job.projectId, job.organizationId]
    )).rows[0];
    if (!project) throw new JobError('Project not found', 'NON_RETRYABLE', false);

    const run = (await query(
      `SELECT id FROM crawl_runs WHERE project_id = $1 AND organization_id = $2 AND status = 'completed' ORDER BY created_at DESC LIMIT 1`,
      [project.id, job.organizationId]
    )).rows[0];
    if (!run) throw new JobError('No completed crawl for this project — VALIDATION_ERROR', 'VALIDATION_ERROR', false);

    const pages = (await query(
      `SELECT url, title, h1, meta_description FROM crawl_pages
       WHERE crawl_run_id = $1 AND organization_id = $2 AND status_code = 200
         AND (content_type IS NULL OR content_type ILIKE 'text/html%') AND COALESCE(is_noindex, FALSE) = FALSE
       ORDER BY url LIMIT 500`,
      [run.id, job.organizationId]
    )).rows;
    const open = (await query(
      `SELECT kind, page_url FROM site_fixes WHERE project_id = $1 AND organization_id = $2
       AND status IN ('proposed', 'approved', 'applied', 'rollback_requested')`,
      [project.id, job.organizationId]
    )).rows;
    const openKeys = new Set<string>(open.map((r: any) => `${r.kind}|${r.page_url}`));

    // Redirects need no AI: broken internal addresses from the same crawl.
    const broken = (await query(
      `SELECT DISTINCT url FROM crawl_pages WHERE crawl_run_id = $1 AND organization_id = $2 AND status_code IN (404, 410) ORDER BY url LIMIT 200`,
      [run.id, job.organizationId]
    )).rows.map((r: any) => r.url as string);
    let redirects = 0;
    for (const r of proposeRedirects(broken.filter((u) => !openKeys.has(`redirect|${u}`)), pages.map((p: any) => p.url), project.normalized_domain || project.domain)) {
      try {
        await query(
          `INSERT INTO site_fixes (organization_id, project_id, kind, page_url, current_value, proposed_value, source)
           SELECT $1, $2, 'redirect', $3, '', $4, 'rule'
           WHERE NOT EXISTS (SELECT 1 FROM site_fixes WHERE project_id = $2 AND organization_id = $1 AND kind = 'redirect'
             AND page_url = $3 AND status IN ('rejected', 'rolled_back'))`,
          [job.organizationId, project.id, r.from, r.to]
        );
        redirects++;
      } catch (error: any) {
        if (error?.code !== '23505') throw error;
      }
    }

    const candidates = selectFixCandidates(pages, openKeys);
    if (candidates.length === 0 || !provider) return { created: redirects, redirects, candidates: candidates.length, ai: !!provider };
    if (signal.aborted) throw new JobError('Fix suggestions aborted', 'TIMEOUT', true);

    let ai;
    try {
      ({ ai, provider } = await completeWithFallback(aiProviders, job.payload?.provider,
        buildFixPrompt(candidates, project.language, project.normalized_domain || project.domain),
        { maxTokens: 3000, temperature: 0.3 }));
    } catch (error) {
      throw aiErrorToJobError(error, `${provider.name} fix suggestions request`);
    }
    if (signal.aborted) throw new JobError('Fix suggestions aborted', 'TIMEOUT', true);

    const suggestions = parseFixSuggestions(ai.content, candidates);
    let created = 0;
    for (const s of suggestions) {
      const current = candidates.find((c) => c.url === s.url && c.kind === s.kind);
      try {
        await query(
          `INSERT INTO site_fixes (organization_id, project_id, kind, page_url, current_value, proposed_value, source)
           VALUES ($1, $2, $3, $4, $5, $6, 'ai')`,
          [job.organizationId, project.id, s.kind, s.url,
            (s.kind === 'meta_title' ? current?.title : current?.metaDescription)?.slice(0, 1000) ?? null, s.value]
        );
        created++;
      } catch (error: any) {
        if (error?.code !== '23505') throw error;
      }
    }

    await recordAiUsage(query, {
      organizationId: job.organizationId, projectId: project.id, provider: ai.provider, model: ai.model,
      inputTokens: ai.inputTokens, outputTokens: ai.outputTokens, estimatedCostUsd: ai.estimatedCostUsd,
      operation: 'fix_suggestions', idempotencyKey: `fixes_${job.id}`, referenceType: 'project', referenceId: project.id,
    });
    console.log(JSON.stringify({ level: 'info', msg: 'Fix suggestions created', job_id: job.id, created, redirects, candidates: candidates.length, prompt: FIX_PROMPT_VERSION }));
    return { created: created + redirects, redirects, candidates: candidates.length, ai: true };
  }

  /**
   * Referring domains for every project and competitor of the organization from one pass over the
   * Common Crawl domain graph, then link-building prospects: domains that link to competitors only.
   */
  private async handleBacklinkDiscovery(job: Job, signal: AbortSignal): Promise<any> {
    const release = String(job.payload?.release || process.env.COMMONCRAWL_GRAPH_RELEASE || DEFAULT_GRAPH_RELEASE);
    if (!/^cc-main-[a-z0-9-]{4,60}$/.test(release)) throw new JobError('Invalid web graph release — VALIDATION_ERROR', 'VALIDATION_ERROR', false);
    const projects = (await query(
      `SELECT id, domain, normalized_domain FROM projects WHERE organization_id = $1 AND deleted_at IS NULL`, [job.organizationId])).rows;
    const competitors = (await query(
      `SELECT id, project_id, domain, normalized_domain FROM competitors WHERE organization_id = $1`, [job.organizationId])).rows;
    const targets = [
      ...projects.map((p: any) => ({ projectId: p.id, competitorId: null as string | null, domain: graphDomain(p.normalized_domain || p.domain) })),
      ...competitors.map((c: any) => ({ projectId: c.project_id, competitorId: c.id as string | null, domain: graphDomain(c.normalized_domain || c.domain) })),
    ].filter((t) => t.domain.includes('.'));
    if (targets.length === 0) return { release, targets: 0 };

    let lastBeat = Date.now();
    const graph = await referringDomains([...new Set(targets.map((t) => t.domain))], {
      baseUrl: process.env.COMMONCRAWL_GRAPH_URL || 'https://data.commoncrawl.org/projects/hyperlinkgraph',
      release, signal,
      onProgress: async (stage, count) => {
        if (Date.now() - lastBeat < 60_000) return;
        lastBeat = Date.now();
        await query('SELECT rf_worker_extend_lease($1, $2, 900)', [job.id, job.executionId]);
        console.log(JSON.stringify({ level: 'info', msg: 'Web graph progress', job_id: job.id, stage, lines: count }));
      },
    });

    let stored = 0;
    for (const t of targets) {
      const domains = graph.referring.get(t.domain) ?? [];
      for (let i = 0; i < domains.length; i += 500) {
        const chunk = domains.slice(i, i + 500);
        const result = await query(
          `INSERT INTO link_domains (organization_id, project_id, competitor_id, target_domain, referring_domain, first_release, last_release)
           SELECT $1, $2, $3, $4, d, $5, $5 FROM unnest($6::text[]) AS d
           ON CONFLICT (project_id, COALESCE(competitor_id, '00000000-0000-0000-0000-000000000000'::uuid), referring_domain)
           DO UPDATE SET last_release = EXCLUDED.last_release, status = 'active', target_domain = EXCLUDED.target_domain, updated_at = NOW()`,
          [job.organizationId, t.projectId, t.competitorId, t.domain, release, chunk]);
        stored += result.rowCount ?? 0;
      }
      // Seen before but not in this release: the link is gone, or the page was not crawled this time.
      if (!graph.missing.includes(t.domain)) {
        await query(
          `UPDATE link_domains SET status = 'lost', updated_at = NOW()
           WHERE organization_id = $1 AND project_id = $2 AND competitor_id IS NOT DISTINCT FROM $3 AND last_release <> $4 AND status = 'active'`,
          [job.organizationId, t.projectId, t.competitorId, release]);
      }
    }

    // Prospects: active links to a competitor, none to the project.
    const prospects = await query(
      `INSERT INTO link_prospects (organization_id, project_id, referring_domain)
       SELECT DISTINCT c.organization_id, c.project_id, c.referring_domain FROM link_domains c
       WHERE c.organization_id = $1 AND c.competitor_id IS NOT NULL AND c.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM link_domains p WHERE p.project_id = c.project_id AND p.competitor_id IS NULL
           AND p.referring_domain = c.referring_domain AND p.status = 'active')
       ON CONFLICT (project_id, referring_domain) DO NOTHING`, [job.organizationId]);

    console.log(JSON.stringify({ level: 'info', msg: 'Backlink discovery completed', job_id: job.id, release, targets: targets.length,
      stored, prospects: prospects.rowCount ?? 0, missing: graph.missing.length, truncated: graph.truncated.length }));
    return { release, targets: targets.length, stored, newProspects: prospects.rowCount ?? 0, missing: graph.missing, truncated: graph.truncated };
  }

  private async handleContentDraft(job: Job, signal: AbortSignal): Promise<any> {
    const briefId = job.payload?.briefId;
    if (!briefId || !job.projectId) throw new JobError('Brief missing in payload — VALIDATION_ERROR', 'VALIDATION_ERROR', false);
    const brief = (await query(
      `SELECT id, project_id, title, target_keyword, target_word_count, word_count, outline, status FROM content_briefs WHERE id = $1 AND organization_id = $2`,
      [briefId, job.organizationId]
    )).rows[0];
    if (!brief) throw new JobError(`Content brief not found: ${briefId}`, 'NON_RETRYABLE', false);
    const fail = async (message: string) => query(
      `UPDATE content_briefs SET draft_status = 'failed', draft_error = $2, draft_updated_at = NOW() WHERE id = $1`, [brief.id, message.slice(0, 500)]);
    if (brief.status !== 'completed' || !Array.isArray(brief.outline?.sections) || brief.outline.sections.length === 0) {
      await fail('Brief has no outline');
      throw new JobError('Brief has no outline — VALIDATION_ERROR', 'VALIDATION_ERROR', false);
    }
    const project = (await query(`SELECT language FROM projects WHERE id = $1 AND organization_id = $2`, [brief.project_id, job.organizationId])).rows[0];
    const aiProviders = createWorkerAiProviders();
    let provider = pickAiProvider(aiProviders, job.payload?.provider);
    if (!provider) {
      await fail('AI provider not configured');
      throw new JobError(AI_NOT_CONFIGURED_MESSAGE, 'PROVIDER_NOT_CONFIGURED', false);
    }
    let ai;
    try {
      ({ ai, provider } = await completeWithFallback(aiProviders, job.payload?.provider, buildDraftPrompt({
        title: brief.title, targetKeyword: brief.target_keyword, targetWordCount: brief.target_word_count || brief.word_count,
        language: project?.language, outline: brief.outline,
      }), { maxTokens: 8000, temperature: 0.6 }));
    } catch (error) {
      const jobError = aiErrorToJobError(error, `${provider.name} article draft request`);
      if (!jobError.retryable) await fail(jobError.message);
      throw jobError;
    }
    if (signal.aborted) throw new JobError('Article draft aborted', 'TIMEOUT', true);
    const { markdown, words } = cleanDraft(ai.content);
    if (words < 100) {
      await fail('The AI returned too little text');
      throw new JobError('Draft too short', 'RETRYABLE', true);
    }
    await query(
      `UPDATE content_briefs SET draft_status = 'ready', draft_markdown = $2, draft_word_count = $3, draft_error = NULL, draft_updated_at = NOW() WHERE id = $1`,
      [brief.id, markdown, words]
    );
    await recordAiUsage(query, {
      organizationId: job.organizationId, projectId: brief.project_id, provider: ai.provider, model: ai.model,
      inputTokens: ai.inputTokens, outputTokens: ai.outputTokens, estimatedCostUsd: ai.estimatedCostUsd,
      operation: 'content_draft', idempotencyKey: `draft_${job.id}`, referenceType: 'content_brief', referenceId: brief.id,
    });
    console.log(JSON.stringify({ level: 'info', msg: 'Article draft written', job_id: job.id, brief_id: brief.id, words, prompt: DRAFT_PROMPT_VERSION }));
    return { words, provider: ai.provider };
  }

  private async handleContentBrief(job: Job, signal: AbortSignal): Promise<any> {
    console.log(JSON.stringify({ level: 'info', msg: 'Content brief', job_id: job.id, brief_id: job.payload?.briefId }));

    const briefId = job.payload?.briefId;
    if (!briefId) throw new JobError('Brief missing in payload — VALIDATION_ERROR', 'VALIDATION_ERROR', false);
    if (!job.projectId) throw new JobError('Project missing for content brief — VALIDATION_ERROR', 'VALIDATION_ERROR', false);

    const briefResult = await query(
      `SELECT id, project_id, title, target_keyword, content_type, target_word_count, word_count FROM content_briefs WHERE id = $1 AND organization_id = $2`,
      [briefId, job.organizationId]
    );
    if (briefResult.rows.length === 0) {
      throw new JobError(`Content brief not found: ${briefId}`, 'NON_RETRYABLE', false);
    }
    const brief = briefResult.rows[0];

    // No AI provider → graceful PROVIDER_NOT_CONFIGURED; the brief is
    // left in 'draft', exactly as the API created it — no fake outline.
    const aiProviders = createWorkerAiProviders();
    let provider = pickAiProvider(aiProviders, job.payload?.provider);
    if (!provider) {
      throw new JobError(AI_NOT_CONFIGURED_MESSAGE, 'PROVIDER_NOT_CONFIGURED', false);
    }

    if (signal.aborted) throw new JobError('Content brief aborted', 'TIMEOUT', true);

    const projectResult = await query(
      `SELECT id, name, domain, normalized_domain, language FROM projects WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [brief.project_id, job.organizationId]
    );
    const project = projectResult.rows[0] || null;

    await query(`UPDATE content_briefs SET status = 'generating', updated_at = NOW() WHERE id = $1`, [brief.id]);

    const prompt = buildBriefPrompt({
      title: brief.title,
      targetKeyword: brief.target_keyword || job.payload?.targetKeyword,
      contentType: brief.content_type,
      targetWordCount: brief.target_word_count || brief.word_count,
      language: project?.language,
      projectDomain: project?.normalized_domain || project?.domain,
    });

    let ai;
    try {
      ({ ai, provider } = await completeWithFallback(aiProviders, job.payload?.provider, prompt, { maxTokens: 2000, temperature: 0.4 }));
    } catch (error) {
      await query(`UPDATE content_briefs SET status = 'failed', updated_at = NOW() WHERE id = $1`, [brief.id]);
      throw aiErrorToJobError(error, `${provider.name} content brief request`);
    }
    if (signal.aborted) {
      await query(`UPDATE content_briefs SET status = 'draft', updated_at = NOW() WHERE id = $1`, [brief.id]);
      throw new JobError('Content brief aborted', 'TIMEOUT', true);
    }

    const { outline, parsed } = parseBriefOutline(ai.content);

    await query(
      `UPDATE content_briefs SET status = 'completed', outline = $2, provider = $3, model = $4, prompt_version = $5, updated_at = NOW() WHERE id = $1`,
      [brief.id, JSON.stringify(outline), ai.provider, ai.model, BRIEF_PROMPT_VERSION]
    );

    await recordAiUsage(query, {
      organizationId: job.organizationId,
      projectId: brief.project_id,
      provider: ai.provider,
      model: ai.model,
      inputTokens: ai.inputTokens,
      outputTokens: ai.outputTokens,
      estimatedCostUsd: ai.estimatedCostUsd,
      operation: 'content_brief',
      idempotencyKey: `brief_${job.id}`,
      referenceType: 'content_brief',
      referenceId: brief.id,
    });

    console.log(JSON.stringify({
      level: 'info', msg: 'Content brief completed', job_id: job.id, brief_id: brief.id,
      provider: ai.provider, model: ai.model, outlineParsed: parsed,
      sections: Array.isArray(outline?.sections) ? outline.sections.length : 0,
      costUsd: ai.estimatedCostUsd,
    }));

    return {
      briefId: brief.id,
      provider: ai.provider,
      model: ai.model,
      outlineParsed: parsed,
      sections: Array.isArray(outline?.sections) ? outline.sections.length : 0,
      estimatedCostUsd: ai.estimatedCostUsd,
    };
  }

  private async handleReportGeneration(job: Job, signal: AbortSignal): Promise<any> {
    console.log(JSON.stringify({ level: 'info', msg: 'Report generation', job_id: job.id, type: job.payload?.type, project_id: job.projectId }));

    if (signal.aborted) throw new JobError('Report generation aborted', 'TIMEOUT', true);

    const reportType = job.payload?.type || 'seo';
    const format = job.payload?.format || 'json';

    // Fetch real project data
    const projectResult = await query(`SELECT id, name, domain, normalized_domain, seo_score FROM projects WHERE id = $1 AND organization_id = $2`, [job.projectId, job.organizationId]);
    if (projectResult.rows.length === 0) {
      throw new JobError('Project not found for report', 'VALIDATION_ERROR', false);
    }

    const project = projectResult.rows[0];

    // Fetch latest crawl
    const crawlResult = await query(`SELECT id, status, crawled_pages, total_pages FROM crawl_runs WHERE project_id = $1 AND organization_id=$2 ORDER BY created_at DESC LIMIT 1`, [job.projectId,job.organizationId]);
    
    // Fetch findings
    const findingsResult = await query(`SELECT rule_id, severity, category, title, affected_urls FROM audit_findings WHERE project_id = $1 AND organization_id = $2 AND crawl_run_id = (SELECT id FROM crawl_runs WHERE project_id = $1 AND organization_id = $2 AND status = 'completed' ORDER BY created_at DESC LIMIT 1) ORDER BY severity LIMIT 100`, [job.projectId,job.organizationId]);

    // Fetch keywords
    const keywordsResult = await query(`SELECT COALESCE(keyword,term) AS term, COALESCE(search_volume,volume) AS volume, difficulty FROM keywords WHERE project_id = $1 AND organization_id=$2 LIMIT 100`, [job.projectId,job.organizationId]);

    // Build report from real data only — no fake
    const reportData = {
      project: {
        id: project.id,
        name: project.name,
        domain: project.domain,
        normalized_domain: project.normalized_domain,
        seo_score: project.seo_score,
      },
      crawl: crawlResult.rows[0] || null,
      findings: findingsResult.rows,
      keywords: keywordsResult.rows,
      generatedAt: new Date().toISOString(),
      integrations: {
        gsc: config.providers.google.clientId && config.providers.google.clientSecret ? 'configured' : 'not_configured',
        ga4: config.providers.google.clientId && config.providers.google.clientSecret ? 'configured' : 'not_configured',
        dataforseo: config.providers.dataforseo.login ? 'configured' : 'not_configured',
        pagespeed: config.providers.pagespeed ? 'configured' : 'not_configured',
      },
      note: 'گزارش بر اساس اطلاعات ثبت‌شدهٔ پروژه در زمان تهیه تنظیم شده است.',
    };

    // Persist report
    const reportId = job.payload?.reportId;
    if (reportId) {
      await query(
        `UPDATE reports SET status = 'completed', data_snapshot = $2, completed_at = NOW() WHERE id = $1 AND organization_id=$3 AND project_id=$4`,
        [reportId, JSON.stringify(reportData),job.organizationId,job.projectId]
      );
    } else {
      // Create report if not exists
      const newReport = await query(
        `INSERT INTO reports (organization_id, project_id, type, title, format, status, data_snapshot, completed_at)
         VALUES ($1, $2, $3, $4, $5, 'completed', $6, NOW()) RETURNING id`,
        [job.organizationId, job.projectId, reportType, `${reportType} report for ${project.domain}`, format, JSON.stringify(reportData)]
      );
      return { reportId: newReport.rows[0].id, ...reportData };
    }

    return reportData;
  }

  /** Signed with HMAC-SHA256. The key is the SHA-256 hex of the webhook secret; only that hash is stored. */
  private async handleWebhookDelivery(job: Job): Promise<any> {
    const found: any = await withTransaction((client) => client.query('SELECT id, url, secret_hash, event, payload FROM rf_worker_delivery_get($1, $2)', [job.id, job.executionId]));
    const delivery = found.rows[0];
    if (!delivery) throw new JobError('Webhook delivery not found', 'NON_RETRYABLE', false);

    const record = (code: number | null, delivered: boolean) =>
      withTransaction((client) => client.query('SELECT rf_worker_delivery_result($1, $2, $3, $4)', [job.id, job.executionId, code, delivered]));
    const body = JSON.stringify(delivery.payload);
    const signature = createHmac('sha256', delivery.secret_hash).update(body).digest('hex');
    let status: number;
    try {
      // Validated on every attempt, and redirects are not followed, so a receiver cannot redirect us inside the network.
      await validateUrlForSSRF(delivery.url);
      const response = await fetch(delivery.url, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
        headers: { 'content-type': 'application/json', 'x-seoyar-event': delivery.event, 'x-seoyar-signature': `sha256=${signature}`, 'x-seoyar-delivery': delivery.id },
        body,
      });
      status = response.status;
    } catch (error) {
      await record(null, false);
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('SECURITY_ERROR')) throw new JobError('Webhook address is not allowed', 'SECURITY_ERROR', false);
      throw new JobError('Webhook receiver could not be reached', 'RETRYABLE', true);
    }
    if (status >= 200 && status < 300) {
      await record(status, true);
      return { deliveryId: delivery.id, status };
    }
    await record(status, false);
    throw new JobError(`Webhook receiver responded ${status}`, 'RETRYABLE', true);
  }

  private async handleAlertProcessing(job: Job, signal: AbortSignal): Promise<any> {
    console.log(JSON.stringify({ level: 'info', msg: 'Alert processing', job_id: job.id, organization_id: job.organizationId }));

    if (signal.aborted) throw new JobError('Alert processing aborted', 'TIMEOUT', true);

    const projectsResult = await query(`SELECT id, seo_score FROM projects WHERE organization_id = $1 AND deleted_at IS NULL`, [job.organizationId]);

    let alertsCreated = 0;
    for (const project of projectsResult.rows) {
      const criticalResult = await query(
        `SELECT COUNT(*) AS count FROM audit_findings WHERE project_id = $1 AND organization_id = $2 AND severity = 'critical' AND status = 'open' AND crawl_run_id = (SELECT id FROM crawl_runs WHERE project_id = $1 AND organization_id = $2 AND status = 'completed' ORDER BY created_at DESC LIMIT 1)`,
        [project.id, job.organizationId],
      );
      const criticalCount = parseInt(criticalResult.rows[0].count, 10);
      if (criticalCount === 0) continue;

      // Database errors propagate and fail the job; only a real insert is counted.
      const created = await this.insertSystemAlert(job.organizationId, project.id, 'critical_issues', 'seo', 'high',
        `Critical SEO issues: ${criticalCount}`,
        `${criticalCount} critical SEO issues detected in project ${project.id}`,
        { criticalCount, projectId: project.id });
      if (created) {
        alertsCreated++;
        await this.notifyOwner(job, 'مشکل بحرانی سئو', `${criticalCount} مشکل بحرانی سئو در یکی از پروژه‌های شما پیدا شد. جزئیات در بخش هشدارها ثبت شده است.`);
      }
    }

    return { alertsCreated, projectsChecked: projectsResult.rows.length };
  }

  /** Returns true only when a row was inserted. An unread alert for the same rule suppresses it. */
  private async insertSystemAlert(organizationId: string, projectId: string, rule: string, type: string, severity: string, title: string, message: string, data: Record<string, unknown>): Promise<boolean> {
    const inserted = await query(
      `INSERT INTO alerts (organization_id, project_id, rule, type, severity, title, message, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (organization_id, project_id, rule, type)
         WHERE read = false AND rule IN ('critical_issues','low_seo_score','job_dead_letter')
         DO NOTHING
       RETURNING id`,
      [organizationId, projectId, rule, type, severity, title, message, JSON.stringify(data)],
    );
    return inserted.rowCount === 1;
  }

  private async createAlertIfNeeded(job: Job, status: string, result: any) {
    if (job.type === 'SITE_CRAWL' && status === 'completed' && job.projectId && result?.seoScore !== undefined && result.seoScore < 50) {
      await this.insertSystemAlert(job.organizationId, job.projectId, 'low_seo_score', 'seo', 'medium',
        `امتیاز سئو پایین است: ${result.seoScore}`,
        'نتیجهٔ آخرین خزش این پروژه زیر ۵۰ است. یافته‌های ممیزی را بررسی کنید.',
        { seoScore: result.seoScore, jobId: job.id });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const worker = new Worker();

function gracefulShutdown(signal: string) {
  console.log(JSON.stringify({ level: 'info', msg: 'Shutdown received', signal }));
  worker.stop();
  setTimeout(async () => {
    try {
      if (pool) await pool.end();
      console.log(JSON.stringify({ level: 'info', msg: 'Pool closed' }));
    } catch (e) {
      console.error(JSON.stringify({ level: 'error', msg: 'Error closing pool', error: e instanceof Error ? e.message : String(e) }));
    }
    process.exit(0);
  }, 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

worker.start().catch(error => {
  console.error(JSON.stringify({ level: 'error', msg: 'Worker crashed', error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }));
  process.exit(1);
});

export { Worker };
