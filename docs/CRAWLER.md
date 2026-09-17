# RankForge — Crawler Documentation

## Overview
Real HTTP crawler with SSRF protection, robots.txt, sitemap.xml, concurrency control, JavaScript rendering fallback where needed.

## Architecture
- Native fetch + Cheerio for HTML parsing
- Playwright optional for JS rendering (when needed)
- Queue-based BFS crawling
- Concurrency-controlled (max 10)
- Delay configurable

## Features

### Must-Have
- robots.txt parsing and respect
- sitemap.xml parsing (including index)
- canonical detection
- redirects (301, 302) with SSRF re-validation
- HTTP status codes
- title, meta description, headings (H1, H2, H3)
- images + alt text
- links (internal/external)
- hreflang
- structured data (JSON-LD)
- noindex, nofollow
- pagination detection
- orphan pages (via link graph)
- duplicate pages (via title/content hash)
- thin pages (<300 words)
- word count, response time, content type, compression
- HTTPS, mixed content, broken resources

### HTML Crawling
- Cheerio loads HTML, extracts all required fields
- Handles malformed HTML gracefully

### JavaScript Rendering
- When needed (e.g., client-rendered pages), Playwright fallback
- Detected via missing content vs. JS-rendered check
- Configurable via crawlConfig

### Configuration
```json
{
  "maxPages": 100,
  "maxDepth": 3,
  "concurrency": 5,
  "delay": 1000,
  "userAgent": "RankForge/1.0",
  "respectRobotsTxt": true,
  "followSitemaps": true,
  "includeSubdomains": false,
  "timeout": 30000
}
```

### SSRF Security
See SECURITY.md — all requests via safeFetch()

### Usage Example
```ts
import { Crawler } from './lib/crawler.js';

const crawler = new Crawler({
  maxPages: 50,
  maxDepth: 2,
  organizationId: 'org_123',
  projectId: 'proj_123',
  concurrency: 3,
  delay: 1000,
});

const result = await crawler.crawl('https://example.com');
console.log(`Crawled ${result.pages.length} pages`);
console.log(`Found ${result.sitemapUrls.length} sitemap URLs`);
console.log(`Errors: ${result.errors.length}`);
```

### Result Structure
```ts
{
  pages: CrawlPage[],
  sitemapUrls: string[],
  robotsTxt: string,
  errors: {url, error}[],
  stats: {totalDiscovered, crawled, failed, duration}
}
```

### CrawlPage Structure
```ts
{
  url,
  normalizedUrl,
  statusCode,
  contentType,
  title,
  metaDescription,
  h1,
  h2: string[],
  h3: string[],
  wordCount,
  responseTime,
  isIndexable,
  canonical,
  robotsMeta,
  hreflang: {lang, href}[],
  structuredData: any[],
  images: {src, alt, width, height}[],
  links: {href, text, isInternal, rel}[],
  headers,
  depth,
  parentUrl
}
```

### Limitations & Safety
- Max pages enforced (plan limits)
- Concurrency capped at 10 to avoid overwhelming target
- Delay between batches
- Timeout per request
- Response size limit 10MB
- Blocked private IPs
- Respects robots.txt by default
- No infinite loops (visited set + normalized URLs)

### Worker Integration
Crawl jobs created via POST /projects/:id/crawl → job queue → worker executes → stores result → updates project seoScore → notifies user

### Testing
- URL normalization
- Same domain detection
- Robots.txt parsing
- Sitemap parsing
- SSRF blocking
- Link extraction
- Performance (100 pages < 2min)
