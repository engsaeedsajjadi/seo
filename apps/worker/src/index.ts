/**
 * RankForge — Worker Process — Production Reality
 * Real PostgreSQL queue with atomic claiming (FOR UPDATE SKIP LOCKED), idempotency, timeout with AbortController, credit ledger atomic
 * No fake sleep() success
 */

import { Pool } from 'pg';
import * as cheerio from 'cheerio';
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
import {
  GoogleWorkerClient,
  GoogleApiError,
  buildGscRequestBody,
  buildGa4RequestBody,
  mapGscSearchAnalyticsResponse,
  mapGa4ReportResponse,
  persistGscMetrics,
  persistGa4Metrics,
  ensureValidAccessToken,
  markIntegrationSyncSuccess,
  markIntegrationError,
  defaultGscWindow,
  defaultGa4Window,
} from './google.js';
import {
  AiProviderError,
  createAiProviders,
  pickAiProvider,
  aiEngineForProvider,
  analyzeGeoResponse,
  buildBriefPrompt,
  parseBriefOutline,
  recordAiUsage,
  BRIEF_PROMPT_VERSION,
  type AIProvider,
} from './ai.js';

// ============================================================
// CONFIG — env-based, fail-fast
// ============================================================

// Load the monorepo-root .env for local development — the documented
// setup creates a single .env at the repo root, and without this the
// local commands (db:migrate, dev servers) cannot see it. Variables
// already present in the process environment always win: Docker
// Compose injects env directly and its images contain no .env file.
import { existsSync as _existsSync, readFileSync as _readFileSync } from 'node:fs';
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
    userAgent: process.env.CRAWLER_USER_AGENT || 'RankForge/1.0 (+https://rankforge.io/bot)',
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
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 10,
  });
  pool.on('error', (err) => {
    console.error(JSON.stringify({ level: 'error', msg: 'Pool error', error: err.message }));
  });
  return pool;
}

async function query(text: string, params?: any[]) {
  const p = getPool();
  return p.query(text, params);
}

async function withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const p = getPool();
  const client = await p.connect();
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

// ============================================================
// SSRF PROTECTION — copied from api lib/ssrf.ts (real)
// ============================================================

const BLOCKED_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^0\.0\.0\.0/,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
];

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.google.com',
  'instance-data',
  '169.254.169.254',
]);

function isBlockedIp(ip: string): boolean {
  return BLOCKED_IP_RANGES.some(r => r.test(ip));
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (lower === 'localhost') return true;
  if (lower.endsWith('.internal') || lower.endsWith('.local')) return true;
  return false;
}

async function validateUrlForSSRF(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url} — VALIDATION_ERROR`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Blocked protocol: ${parsed.protocol} — SECURITY_ERROR`);
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new Error(`Blocked hostname: ${parsed.hostname} — SECURITY_ERROR`);
  }

  // Basic IP check for literal IPs
  if (/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname) || parsed.hostname.includes(':')) {
    if (isBlockedIp(parsed.hostname)) {
      throw new Error(`Blocked IP: ${parsed.hostname} — SECURITY_ERROR`);
    }
  }
}

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

      const html = await response.text();
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
type Category = 'crawlability' | 'indexability' | 'metadata' | 'content' | 'links' | 'images' | 'performance' | 'security' | 'structured_data' | 'international';

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

  return findings;
}

function calculateSeoScore(findings: AuditFinding[]): { overall: number; categories: Record<string, number> } {
  let score = 100;
  const deductions: Record<Severity, number> = { critical: 10, high: 5, medium: 2, low: 1, notice: 0 };
  const categoryScores: Record<string, { total: number; count: number }> = {};

  for (const f of findings) {
    const deduction = deductions[f.severity] * Math.min(f.affectedUrls.length, 5);
    score -= deduction;
    if (!categoryScores[f.category]) categoryScores[f.category] = { total: 100, count: 0 };
    categoryScores[f.category].total -= deduction;
    categoryScores[f.category].count++;
  }

  score = Math.max(0, Math.min(100, score));
  const categories: Record<string, number> = {};
  for (const [cat, data] of Object.entries(categoryScores)) {
    categories[cat] = Math.max(0, Math.min(100, data.total));
  }
  const allCats: Category[] = ['crawlability','indexability','metadata','content','links','images','performance','security','structured_data','international'];
  for (const cat of allCats) {
    if (!(cat in categories)) categories[cat] = 100;
  }

  return { overall: Math.round(score), categories };
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
  executionId?: string;
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
  return new JobError(`${context} failed — ${error instanceof Error ? error.message : String(error)}`, 'RETRYABLE', true);
}

type JobErrorCode = 'RETRYABLE' | 'NON_RETRYABLE' | 'PROVIDER_NOT_CONFIGURED' | 'VALIDATION_ERROR' | 'SECURITY_ERROR' | 'TIMEOUT' | 'INTERNAL_ERROR';

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
// CREDIT SYSTEM — Atomic with idempotency
// ============================================================

async function deductCreditsAtomic(client: any, organizationId: string, amount: number, description: string, idempotencyKey: string, referenceType: string, referenceId: string): Promise<{ success: boolean; wallet?: any; error?: string }> {
  // Check idempotency first
  const existing = await client.query(
    'SELECT id FROM credit_transactions WHERE idempotency_key = $1',
    [idempotencyKey]
  );
  if (existing.rows.length > 0) {
    console.log(JSON.stringify({ level: 'info', msg: 'Credit deduction idempotent — already processed', idempotencyKey, organizationId }));
    const wallet = await client.query('SELECT * FROM credit_wallets WHERE organization_id = $1', [organizationId]);
    return { success: true, wallet: wallet.rows[0] };
  }

  const walletResult = await client.query(
    'SELECT id, balance FROM credit_wallets WHERE organization_id = $1 FOR UPDATE',
    [organizationId]
  );

  if (walletResult.rows.length === 0) {
    return { success: false, error: 'Wallet not found' };
  }

  const wallet = walletResult.rows[0];
  if (wallet.balance < amount) {
    return { success: false, error: 'Insufficient credits' };
  }

  const newBalance = wallet.balance - amount;

  await client.query(
    'UPDATE credit_wallets SET balance = $1, total_consumed = total_consumed + $2, updated_at = NOW() WHERE organization_id = $3',
    [newBalance, amount, organizationId]
  );

  await client.query(
    `INSERT INTO credit_transactions (organization_id, type, amount, balance_after, description, reference_type, reference_id, idempotency_key)
     VALUES ($1, 'consumption', $2, $3, $4, $5, $6, $7)`,
    [organizationId, -amount, newBalance, description, referenceType, referenceId, idempotencyKey]
  );

  const updatedWallet = await client.query(
    'SELECT id, organization_id, balance, total_granted, total_consumed FROM credit_wallets WHERE organization_id = $1',
    [organizationId]
  );

  return { success: true, wallet: updatedWallet.rows[0] };
}

// ============================================================
// WORKER — Atomic claiming, real work, AbortController timeout
// ============================================================

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
      // ATOMIC CLAIMING with FOR UPDATE SKIP LOCKED
      const claimedJobs = await withTransaction(async (client) => {
        // Select pending jobs with SKIP LOCKED to prevent duplicate claiming
        const selectResult = await client.query(`
          WITH claimed AS (
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
          RETURNING id, organization_id as "organizationId", project_id as "projectId", type, status, payload, attempts, max_attempts as "maxAttempts", created_at as "createdAt", idempotency_key as "idempotencyKey", execution_id as "executionId"
        `, [availableSlots]);
        
        return selectResult.rows as Job[];
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
    const executionId = job.executionId || `exec_${Date.now()}_${Math.random().toString(36).substring(2,8)}`;
    
    console.log(JSON.stringify({
      level: 'info',
      msg: 'Processing job',
      job_id: job.id,
      execution_id: executionId,
      organization_id: job.organizationId,
      project_id: job.projectId,
      job_type: job.type,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts,
    }));

    // Create attempt record
    try {
      await query(
        `INSERT INTO job_attempts (job_id, attempt_number, status, started_at) VALUES ($1, $2, 'running', NOW())`,
        [job.id, job.attempts]
      );
    } catch (e) {
      console.warn(JSON.stringify({ level: 'warn', msg: 'Failed to create attempt record', job_id: job.id, error: e instanceof Error ? e.message : String(e) }));
    }

    const abortController = new AbortController();
    let timeoutId: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        abortController.abort();
        reject(new JobError(`Job timeout after ${this.timeout}ms`, 'TIMEOUT', true));
      }, this.timeout);
    });

    try {
      const workPromise = this.executeJob(job, abortController.signal);
      const result = await Promise.race([workPromise, timeoutPromise]);
      
      if (timeoutId) clearTimeout(timeoutId);

      // Mark completed
      await query(
        `UPDATE jobs SET status = 'completed', completed_at = NOW(), result = $2, failed_at = NULL, error = NULL, error_code = NULL WHERE id = $1`,
        [job.id, JSON.stringify(result || { completedAt: new Date().toISOString(), durationMs: Date.now() - startTime, executionId })]
      );

      // Update attempt
      await query(
        `UPDATE job_attempts SET status = 'completed', completed_at = NOW(), duration_ms = $2 WHERE job_id = $1 AND attempt_number = $3`,
        [job.id, Date.now() - startTime, job.attempts]
      );

      console.log(JSON.stringify({
        level: 'info',
        msg: 'Job completed',
        job_id: job.id,
        execution_id: executionId,
        organization_id: job.organizationId,
        project_id: job.projectId,
        job_type: job.type,
        duration_ms: Date.now() - startTime,
        status: 'completed',
      }));

      // Handle credit deduction for crawl jobs — atomic with idempotency
      if (job.type === 'SITE_CRAWL') {
        try {
          await withTransaction(async (client) => {
            const idempotencyKey = `credit_${job.id}_${job.attempts}`;
            const creditResult = await deductCreditsAtomic(
              client,
              job.organizationId,
              5,
              `Crawl job ${job.id} — ${job.payload?.domain || 'unknown'}`,
              idempotencyKey,
              'job',
              job.id
            );
            if (!creditResult.success) {
              console.warn(JSON.stringify({ level: 'warn', msg: 'Credit deduction failed', job_id: job.id, error: creditResult.error }));
            } else {
              console.log(JSON.stringify({ level: 'info', msg: 'Credits deducted', job_id: job.id, balance: creditResult.wallet?.balance }));
            }
          });
        } catch (e) {
          console.warn(JSON.stringify({ level: 'warn', msg: 'Credit deduction transaction failed', job_id: job.id, error: e instanceof Error ? e.message : String(e) }));
        }
      }

      // Create success alert if needed
      await this.createAlertIfNeeded(job, 'completed', result);

    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      
      const message = error instanceof Error ? error.message : String(error);
      const errorCode = error instanceof JobError ? error.code : 'INTERNAL_ERROR';
      const retryable = error instanceof JobError ? error.retryable : (errorCode === 'RETRYABLE' || errorCode === 'TIMEOUT');

      console.error(JSON.stringify({
        level: 'error',
        msg: 'Job failed',
        job_id: job.id,
        execution_id: executionId,
        organization_id: job.organizationId,
        project_id: job.projectId,
        job_type: job.type,
        attempt: job.attempts,
        maxAttempts: job.maxAttempts,
        error_code: errorCode,
        error: message,
        retryable,
        duration_ms: Date.now() - startTime,
      }));

      // Update attempt
      try {
        await query(
          `UPDATE job_attempts SET status = 'failed', completed_at = NOW(), duration_ms = $2, error = $3, error_code = $4 WHERE job_id = $1 AND attempt_number = $5`,
          [job.id, Date.now() - startTime, message, errorCode, job.attempts]
        );
      } catch {}

      try {
        const attemptsResult = await query('SELECT attempts, max_attempts FROM jobs WHERE id = $1', [job.id]);
        const currentAttempts = attemptsResult.rows[0]?.attempts || job.attempts;
        const maxAttempts = attemptsResult.rows[0]?.max_attempts || job.maxAttempts;

        if (!retryable || currentAttempts >= maxAttempts) {
          // Dead-letter
          await query(
            `UPDATE jobs SET status = 'dead_letter', error = $2, error_code = $3, completed_at = NOW(), failed_at = NOW() WHERE id = $1`,
            [job.id, message, errorCode]
          );
          console.log(JSON.stringify({ level: 'warn', msg: 'Job dead-letter', job_id: job.id, attempts: currentAttempts, error_code: errorCode }));
          await this.handleDeadLetter(job, message, errorCode);
        } else {
          const backoff = Math.min(Math.pow(2, currentAttempts) * 1000, 60000); // cap 60s
          console.log(JSON.stringify({ level: 'info', msg: 'Job will retry', job_id: job.id, backoff_ms: backoff, attempt: currentAttempts, maxAttempts }));
          await query(
            `UPDATE jobs SET status = 'retrying', error = $2, error_code = $3, scheduled_at = NOW() + INTERVAL '${backoff} milliseconds' WHERE id = $1`,
            [job.id, message, errorCode]
          );
          // After backoff, set back to pending via scheduled_at check
          setTimeout(async () => {
            try {
              await query(`UPDATE jobs SET status = 'pending' WHERE id = $1 AND status = 'retrying'`, [job.id]);
            } catch {}
          }, backoff);
        }
      } catch (e) {
        console.error(JSON.stringify({ level: 'error', msg: 'Failed to update job after failure', job_id: job.id, error: e instanceof Error ? e.message : String(e) }));
      }
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
      case 'REPORT_GENERATION':
        return this.handleReportGeneration(job, signal);
      case 'ALERT_EVALUATION':
      case 'ALERT_PROCESSING':
        return this.handleAlertProcessing(job, signal);
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
    const crawlRunId = job.payload?.crawlRunId;
    const maxPages = job.payload?.maxPages || 20;
    const maxDepth = job.payload?.maxDepth || 2;
    const concurrency = Math.min(job.payload?.concurrency || 3, config.crawler.maxConcurrency);

    if (!domain) {
      throw new JobError('Domain missing in payload — VALIDATION_ERROR', 'VALIDATION_ERROR', false);
    }

    console.log(JSON.stringify({
      level: 'info',
      msg: 'Starting real crawl',
      job_id: job.id,
      domain,
      crawlRunId,
      maxPages,
      maxDepth,
      organization_id: job.organizationId,
      project_id: job.projectId,
    }));

    // Validate domain not private
    await validateUrlForSSRF(`https://${domain}`);

    if (crawlRunId) {
      await query(`UPDATE crawl_runs SET status = 'running', started_at = NOW(), config = $2 WHERE id = $1`, [crawlRunId, JSON.stringify({ maxPages, maxDepth, concurrency })]);
    }

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

    // Persist crawl run stats
    if (crawlRunId) {
      await query(
        `UPDATE crawl_runs SET status = 'completed', total_pages = $2, crawled_pages = $3, failed_pages = $4, completed_at = NOW() WHERE id = $1`,
        [crawlRunId, crawlResult.stats.totalDiscovered, crawlResult.stats.crawled, crawlResult.stats.failed]
      );

      // Persist pages — with idempotency via UNIQUE(crawl_run_id, normalized_url)
      let savedPages = 0;
      for (const page of crawlResult.pages) {
        try {
          await query(
            `INSERT INTO crawl_pages (crawl_run_id, organization_id, project_id, url, normalized_url, status_code, content_type, title, meta_description, h1, word_count, response_time_ms, canonical_url, robots_directive, is_noindex, headers, links, images, structured_data)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
             ON CONFLICT (crawl_run_id, normalized_url) DO UPDATE SET
               status_code = EXCLUDED.status_code,
               title = EXCLUDED.title,
               meta_description = EXCLUDED.meta_description,
               h1 = EXCLUDED.h1,
               word_count = EXCLUDED.word_count,
               response_time_ms = EXCLUDED.response_time_ms
            `,
            [
              crawlRunId,
              job.organizationId,
              job.projectId,
              page.url,
              page.normalizedUrl,
              page.statusCode,
              page.contentType,
              page.title,
              page.metaDescription,
              page.h1,
              page.wordCount,
              page.responseTime,
              page.canonical,
              page.robotsMeta,
              !page.isIndexable,
              JSON.stringify(page.headers || {}),
              JSON.stringify(page.links || []),
              JSON.stringify(page.images || []),
              JSON.stringify(page.structuredData || []),
            ]
          );
          savedPages++;
        } catch (e) {
          console.warn(JSON.stringify({ level: 'warn', msg: 'Failed to save page', job_id: job.id, url: page.url, error: e instanceof Error ? e.message : String(e) }));
        }
      }

      console.log(JSON.stringify({ level: 'info', msg: 'Pages persisted', job_id: job.id, savedPages }));

      // Run real SEO audit
      if (crawlResult.pages.length > 0) {
        const findings = runAudit({
          pages: crawlResult.pages,
          domain,
          sitemapUrls: crawlResult.sitemapUrls || [],
          robotsTxt: crawlResult.robotsTxt,
        });

        console.log(JSON.stringify({ level: 'info', msg: 'Audit completed', job_id: job.id, findings: findings.length }));

        // Persist findings — idempotent via no unique constraint, but we delete old findings for same crawl_run_id first for idempotency
        await query(`DELETE FROM audit_findings WHERE crawl_run_id = $1`, [crawlRunId]);
        await query(`DELETE FROM crawl_issues WHERE crawl_run_id = $1`, [crawlRunId]);

        let savedFindings = 0;
        for (const finding of findings) {
          try {
            await query(
              `INSERT INTO audit_findings (organization_id, project_id, crawl_run_id, rule_id, severity, category, title, description, evidence, affected_urls, recommendation, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'open')`,
              [
                job.organizationId,
                job.projectId,
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
            // Also insert into crawl_issues for compatibility
            await query(
              `INSERT INTO crawl_issues (crawl_run_id, organization_id, project_id, rule_id, severity, category, url, title, description, recommendation, evidence, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'open')`,
              [
                crawlRunId,
                job.organizationId,
                job.projectId,
                finding.ruleId,
                finding.severity,
                finding.category,
                finding.affectedUrls[0] || `https://${domain}`,
                finding.title,
                finding.description,
                finding.recommendation,
                JSON.stringify(finding.evidence || {}),
              ]
            );
            savedFindings++;
          } catch (e) {
            console.warn(JSON.stringify({ level: 'warn', msg: 'Failed to save finding', job_id: job.id, ruleId: finding.ruleId, error: e instanceof Error ? e.message : String(e) }));
          }
        }

        console.log(JSON.stringify({ level: 'info', msg: 'Findings persisted', job_id: job.id, savedFindings }));

        // Calculate and update SEO score — deterministic
        const score = calculateSeoScore(findings);
        await query(
          `UPDATE projects SET seo_score = $2, last_crawl_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [job.projectId, score.overall]
        );

        console.log(JSON.stringify({ level: 'info', msg: 'SEO score updated', job_id: job.id, project_id: job.projectId, score: score.overall }));

        return {
          crawlRunId,
          stats: crawlResult.stats,
          pagesCrawled: crawlResult.pages.length,
          findingsCount: findings.length,
          seoScore: score.overall,
          categories: score.categories,
        };
      }
    }

    return {
      crawlRunId,
      stats: crawlResult.stats,
      pagesCrawled: crawlResult.pages.length,
    };
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
       FROM crawl_pages WHERE crawl_run_id = $1`,
      [crawlRunId]
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

    const projectResult = await query(`SELECT normalized_domain FROM projects WHERE id = $1`, [job.projectId]);
    const domain = projectResult.rows[0]?.normalized_domain || 'unknown';

    const findings = runAudit({
      pages,
      domain,
      sitemapUrls: [],
      robotsTxt: undefined,
    });

    // Persist findings idempotently
    await query(`DELETE FROM audit_findings WHERE crawl_run_id = $1`, [crawlRunId]);
    for (const finding of findings) {
      await query(
        `INSERT INTO audit_findings (organization_id, project_id, crawl_run_id, rule_id, severity, category, title, description, evidence, affected_urls, recommendation, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'open')`,
        [job.organizationId, job.projectId, crawlRunId, finding.ruleId, finding.severity, finding.category, finding.title, finding.description, JSON.stringify(finding.evidence), finding.affectedUrls, finding.recommendation]
      );
    }

    const score = calculateSeoScore(findings);
    await query(`UPDATE projects SET seo_score = $2, updated_at = NOW() WHERE id = $1`, [job.projectId, score.overall]);

    return { findingsCount: findings.length, seoScore: score.overall, crawlRunId };
  }

  private async handleRankCheck(job: Job, signal: AbortSignal): Promise<any> {
    console.log(JSON.stringify({ level: 'info', msg: 'Rank check', job_id: job.id, project_id: job.projectId }));

    // No credentials → graceful PROVIDER_NOT_CONFIGURED, no fake rankings (unchanged contract).
    const client = createDataForSeoClient();
    if (!client.isConfigured()) {
      throw new JobError('Rank check provider not configured — DataForSEO credentials missing (set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD) — PROVIDER_NOT_CONFIGURED', 'PROVIDER_NOT_CONFIGURED', false);
    }

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
      return { keywordsChecked: 0, ranked: 0, notRanked: 0, provider: 'dataforseo', message: 'No tracked keywords for project — nothing to check' };
    }

    let ranked = 0;
    let notRanked = 0;

    for (const kw of keywordResult.rows) {
      if (signal.aborted) throw new JobError('Rank check aborted', 'TIMEOUT', true);

      let serp;
      try {
        serp = await client.searchSerp(kw.term, { locationCode, languageCode, device });
      } catch (error) {
        throw providerErrorToJobError(error, 'DataForSEO SERP request');
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
        rawData: {
          requestId: serp.requestId,
          totalResults: serp.totalResults,
          serpFeatures: serp.serpFeatures,
          locationCode,
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
      provider: 'dataforseo',
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

    console.log(JSON.stringify({
      level: 'info', msg: 'GSC sync completed', job_id: job.id, project_id: job.projectId, siteUrl, window, ...stats,
    }));

    return { siteUrl, provider: 'gsc', window, ...stats };
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
    console.log(JSON.stringify({ level: 'info', msg: 'AI visibility check', job_id: job.id, prompt: job.payload?.prompt }));

    // No AI provider → graceful PROVIDER_NOT_CONFIGURED, no fabricated visibility.
    const provider = pickAiProvider(createWorkerAiProviders(), job.payload?.provider);
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
      ai = await provider.complete(prompt, { maxTokens: 800, temperature: 0.2 });
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
    const provider = pickAiProvider(createWorkerAiProviders(), job.payload?.provider);
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
      ai = await provider.complete(prompt, { maxTokens: 2000, temperature: 0.4 });
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
    const crawlResult = await query(`SELECT id, status, crawled_pages, total_pages FROM crawl_runs WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`, [job.projectId]);
    
    // Fetch findings
    const findingsResult = await query(`SELECT rule_id, severity, category, title, affected_urls FROM audit_findings WHERE project_id = $1 ORDER BY severity LIMIT 100`, [job.projectId]);

    // Fetch keywords
    const keywordsResult = await query(`SELECT term, volume, difficulty FROM keywords WHERE project_id = $1 LIMIT 100`, [job.projectId]);

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
      note: 'Report built from real persisted data only. Integrations show not_configured when credentials missing.',
    };

    // Persist report
    const reportId = job.payload?.reportId;
    if (reportId) {
      await query(
        `UPDATE reports SET status = 'completed', data_snapshot = $2, completed_at = NOW() WHERE id = $1`,
        [reportId, JSON.stringify(reportData)]
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

  private async handleAlertProcessing(job: Job, signal: AbortSignal): Promise<any> {
    console.log(JSON.stringify({ level: 'info', msg: 'Alert processing', job_id: job.id, organization_id: job.organizationId }));

    if (signal.aborted) throw new JobError('Alert processing aborted', 'TIMEOUT', true);

    // Real alert logic: check for conditions
    const projectsResult = await query(`SELECT id, seo_score FROM projects WHERE organization_id = $1 AND deleted_at IS NULL`, [job.organizationId]);
    
    let alertsCreated = 0;
    for (const project of projectsResult.rows) {
      // Check for critical findings
      const criticalResult = await query(
        `SELECT COUNT(*) as count FROM audit_findings WHERE project_id = $1 AND severity = 'critical' AND status = 'open'`,
        [project.id]
      );
      const criticalCount = parseInt(criticalResult.rows[0].count, 10);
      
      if (criticalCount > 0) {
        // Idempotent alert — UNIQUE(organization_id, project_id, rule, type, triggered_at) prevents duplicates
        try {
          await query(
            `INSERT INTO alerts (organization_id, project_id, rule, type, message, title, severity, data, triggered_at)
             VALUES ($1, $2, 'critical_issues', 'seo', $3, $4, 'high', $5, NOW())
             ON CONFLICT (organization_id, project_id, rule, type, triggered_at) DO NOTHING`,
            [
              job.organizationId,
              project.id,
              `${criticalCount} critical SEO issues detected in project ${project.id}`,
              `Critical SEO issues: ${criticalCount}`,
              JSON.stringify({ criticalCount, projectId: project.id }),
            ]
          );
          alertsCreated++;
        } catch (e) {
          // Ignore duplicate
        }
      }
    }

    return { alertsCreated, projectsChecked: projectsResult.rows.length };
  }

  private async handleDeadLetter(job: Job, error: string, errorCode: string) {
    // alerts.project_id is a NOT NULL FK to projects — a project-less
    // job (e.g. org-level ALERT_EVALUATION) has nowhere truthful to
    // attach an alert, so it is logged and skipped instead of being
    // pointed at a fabricated project id.
    if (!job.projectId) {
      console.log(JSON.stringify({ level: 'info', msg: 'Dead-letter alert skipped — job has no project', job_id: job.id, job_type: job.type }));
      return;
    }
    try {
      // alerts.rule is NOT NULL — the system rule for dead-lettered
      // jobs is 'job_dead_letter' (type 'job_failed' is the alert
      // category the schema's CHECK intends for these).
      await query(
        `INSERT INTO alerts (organization_id, project_id, rule, type, severity, title, message, data, triggered_at)
         VALUES ($1, $2, 'job_dead_letter', 'job_failed', 'high', $3, $4, $5, NOW())
         ON CONFLICT (organization_id, project_id, rule, type, triggered_at) DO NOTHING`,
        [
          job.organizationId,
          job.projectId,
          `Job failed: ${job.type}`,
          `Job ${job.id} failed after ${job.attempts} attempts: ${error} (code: ${errorCode})`,
          JSON.stringify({ jobId: job.id, jobType: job.type, error, errorCode, executionId: job.executionId }),
        ]
      );
    } catch (e) {
      console.error(JSON.stringify({ level: 'error', msg: 'Failed to create dead-letter alert', job_id: job.id, error: e instanceof Error ? e.message : String(e) }));
    }
  }

  private async createAlertIfNeeded(job: Job, status: string, result: any) {
    // For critical jobs, create completion alert
    if (job.type === 'SITE_CRAWL' && status === 'completed' && result?.seoScore !== undefined) {
      if (result.seoScore < 50) {
        try {
          await query(
            `INSERT INTO alerts (organization_id, project_id, rule, type, message, title, severity, data, triggered_at)
             VALUES ($1, $2, 'low_seo_score', 'seo', $3, $4, 'medium', $5, NOW())
             ON CONFLICT (organization_id, project_id, rule, type, triggered_at) DO NOTHING`,
            [
              job.organizationId,
              job.projectId,
              `Low SEO score ${result.seoScore} for project ${job.projectId}`,
              `Low SEO score: ${result.seoScore}`,
              JSON.stringify({ seoScore: result.seoScore, jobId: job.id }),
            ]
          );
        } catch {}
      }
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
