/**
 * RankForge — Production Crawler
 * Real HTTP crawler with SSRF protection, robots.txt, sitemap.xml, concurrency control
 */

import * as cheerio from 'cheerio';
import { safeFetch, validateUrlForSSRF, SSRFError } from './ssrf.js';

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  concurrency?: number;
  delay?: number;
  userAgent?: string;
  respectRobotsTxt?: boolean;
  followSitemaps?: boolean;
  includeSubdomains?: boolean;
  timeout?: number;
  organizationId: string;
  projectId: string;
}

export interface CrawlPage {
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

export interface CrawlResult {
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
    // Remove trailing slash except for root
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString().toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function isSameDomain(url1: string, url2: string, includeSubdomains = false): boolean {
  try {
    const d1 = new URL(url1).hostname.replace(/^www\./, '');
    const d2 = new URL(url2).hostname.replace(/^www\./, '');
    if (includeSubdomains) {
      return d1 === d2 || d1.endsWith(`.${d2}`) || d2.endsWith(`.${d1}`);
    }
    return d1 === d2;
  } catch {
    return false;
  }
}

async function fetchRobotsTxt(baseUrl: string, userAgent: string): Promise<{ content: string; rules: { disallow: string[]; allow: string[]; sitemap: string[] } }> {
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl).toString();
    await validateUrlForSSRF(robotsUrl);
    const res = await safeFetch(robotsUrl, { userAgent, timeout: 10000 });
    if (!res.ok) {
      return { content: '', rules: { disallow: [], allow: [], sitemap: [] } };
    }
    const content = await res.text();
    const disallow: string[] = [];
    const allow: string[] = [];
    const sitemap: string[] = [];
    
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().startsWith('disallow:')) {
        const path = trimmed.substring(9).trim();
        if (path) disallow.push(path);
      } else if (trimmed.toLowerCase().startsWith('allow:')) {
        const path = trimmed.substring(6).trim();
        if (path) allow.push(path);
      } else if (trimmed.toLowerCase().startsWith('sitemap:')) {
        const url = trimmed.substring(8).trim();
        if (url) sitemap.push(url);
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
    // Check allow first (more specific)
    for (const allowPath of rules.allow) {
      if (pathname.startsWith(allowPath)) return true;
    }
    for (const disallowPath of rules.disallow) {
      if (disallowPath === '/') return false; // Disallow all
      if (disallowPath && pathname.startsWith(disallowPath)) return false;
    }
    return true;
  } catch {
    return true;
  }
}

async function fetchSitemap(sitemapUrl: string, userAgent: string): Promise<string[]> {
  try {
    await validateUrlForSSRF(sitemapUrl);
    const res = await safeFetch(sitemapUrl, { userAgent, timeout: 15000 });
    if (!res.ok) return [];
    const xml = await res.text();
    const urls: string[] = [];
    // Simple XML parsing for sitemap
    const locRegex = /<loc>(.*?)<\/loc>/g;
    let match;
    while ((match = locRegex.exec(xml)) !== null) {
      urls.push(match[1].trim());
    }
    return urls;
  } catch {
    return [];
  }
}

export class Crawler {
  private options: Required<CrawlOptions>;
  private visited = new Set<string>();
  private queue: Array<{ url: string; depth: number; parentUrl?: string }> = [];
  private pages: CrawlPage[] = [];
  private errors: Array<{ url: string; error: string }> = [];
  private robotsRules: { disallow: string[]; allow: string[]; sitemap: string[] } = { disallow: [], allow: [], sitemap: [] };
  private robotsContent?: string;
  private sitemapUrls: string[] = [];

  constructor(options: CrawlOptions) {
    this.options = {
      maxPages: options.maxPages ?? 100,
      maxDepth: options.maxDepth ?? 3,
      concurrency: Math.min(options.concurrency ?? 5, 10),
      delay: options.delay ?? 1000,
      userAgent: options.userAgent ?? 'RankForge/1.0 (+https://rankforge.io/bot)',
      respectRobotsTxt: options.respectRobotsTxt ?? true,
      followSitemaps: options.followSitemaps ?? true,
      includeSubdomains: options.includeSubdomains ?? false,
      timeout: options.timeout ?? 30000,
      organizationId: options.organizationId,
      projectId: options.projectId,
    };
  }

  async crawl(startUrl: string): Promise<CrawlResult> {
    const startTime = Date.now();
    const normalizedStart = normalizeUrl(startUrl);
    
    // Validate start URL
    await validateUrlForSSRF(startUrl);

    // Fetch robots.txt
    if (this.options.respectRobotsTxt) {
      const robots = await fetchRobotsTxt(startUrl, this.options.userAgent);
      this.robotsContent = robots.content;
      this.robotsRules = robots.rules;
      this.sitemapUrls = robots.rules.sitemap;

      if (this.options.followSitemaps && robots.rules.sitemap.length > 0) {
        for (const sitemapUrl of robots.rules.sitemap.slice(0, 3)) {
          const urls = await fetchSitemap(sitemapUrl, this.options.userAgent);
          this.sitemapUrls.push(...urls);
        }
      }
    }

    this.queue.push({ url: startUrl, depth: 0 });

    while (this.queue.length > 0 && this.pages.length < this.options.maxPages) {
      const batch = this.queue.splice(0, this.options.concurrency);
      
      await Promise.all(batch.map(item => this.crawlPage(item)));

      if (this.options.delay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.options.delay));
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
    const normalized = normalizeUrl(item.url);
    
    if (this.visited.has(normalized)) return;
    this.visited.add(normalized);

    if (item.depth > this.options.maxDepth) return;

    if (this.options.respectRobotsTxt && !isUrlAllowedByRobots(item.url, this.robotsRules)) {
      return;
    }

    const startTime = Date.now();
    
    try {
      await validateUrlForSSRF(item.url);
      
      const response = await safeFetch(item.url, {
        userAgent: this.options.userAgent,
        timeout: this.options.timeout,
      });

      const responseTime = Date.now() - startTime;
      const contentType = response.headers.get('content-type') || '';
      
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        // Non-HTML, record minimal
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

      const isIndexable = !(
        robotsMeta?.toLowerCase().includes('noindex') ||
        response.headers.get('x-robots-tag')?.toLowerCase().includes('noindex')
      );

      const hreflang = $('link[rel="alternate"][hreflang]').map((_, el) => ({
        lang: $(el).attr('hreflang') || '',
        href: $(el).attr('href') || '',
      })).get();

      const structuredData: any[] = [];
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const data = JSON.parse($(el).html() || '');
          structuredData.push(data);
        } catch {
          // Ignore invalid JSON-LD
        }
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
        } catch {
          // Invalid URL, keep original
        }
        return {
          href: absoluteHref,
          text: $(el).text().trim().slice(0, 200),
          isInternal: isSameDomain(item.url, absoluteHref, this.options.includeSubdomains),
          rel: $(el).attr('rel'),
        };
      }).get().filter(link => link.href.startsWith('http'));

      // Discover new URLs
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
      
      if (error instanceof SSRFError) {
        // SSRF errors are critical, don't retry
        console.warn(`SSRF blocked for ${item.url}: ${message}`);
      }
    }
  }
}
