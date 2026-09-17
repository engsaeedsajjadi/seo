# RankForge — SEO Engine Documentation

## Overview
Production SEO engine with real crawler, audit rule engine, scoring, keywords, SERP, rankings, competitors, backlinks, GSC, GA4, PageSpeed, content, GEO, AEO.

## Crawler

### Capabilities
- robots.txt parsing (disallow, allow, sitemap)
- sitemap.xml parsing (including sitemap index)
- Canonical detection
- Redirects handling (with SSRF re-validation)
- HTTP status (200, 301, 302, 404, 500, etc)
- Title, meta description, headings (H1, H2, H3)
- Images with alt text
- Links (internal/external, rel attributes)
- Hreflang
- Structured data (JSON-LD, Microdata detection)
- Noindex, nofollow
- Word count, response time, content type, compression
- HTTPS, mixed content detection
- Broken resources

### Configuration
- maxPages: 1-1000 (plan limited)
- maxDepth: 1-10
- concurrency: 1-10 (max 10 enforced)
- delay: 0-5000ms
- userAgent: configurable, default RankForge/1.0
- respectRobotsTxt: boolean
- followSitemaps: boolean
- includeSubdomains: boolean
- timeout: 5s-30s

### SSRF Protection
Every request validated via `safeFetch()` — see SECURITY.md

### Usage
```ts
const crawler = new Crawler({
  maxPages: 100,
  maxDepth: 3,
  organizationId,
  projectId,
  concurrency: 5,
});
const result = await crawler.crawl('https://example.com');
```

## Technical Audit

### Rule Engine
Each rule:
- id: unique string
- severity: critical, high, medium, low, notice
- category: crawlability, indexability, metadata, content, links, images, performance, security, structured_data, international
- description, evidence, affectedUrls, recommendation, documentationUrl, status

### Rules (13+)
- missing_title (critical, metadata)
- duplicate_title (high, metadata)
- title_too_long (medium, metadata)
- missing_meta_description (medium, metadata)
- missing_h1 (high, content)
- thin_content (medium, content) — <300 words
- images_without_alt (low, images)
- broken_links (high, links) — 4xx/5xx
- noindex_pages (notice, indexability)
- missing_canonical (low, indexability)
- slow_pages (medium, performance) — >2s
- missing_structured_data (low, structured_data)
- insecure_links (medium, security) — HTTP internal links

### Scoring
Transparent:
- Start 100
- Deductions: critical 10, high 5, medium 2, low 1, notice 0
- Per rule capped at 5 URLs
- Category scores: per-category deductions
- Overall: Math.max(0, Math.min(100, score))
- Always show why score exists (findings breakdown)

### Execution
```ts
const findings = runAudit({ pages, domain, sitemapUrls, robotsTxt });
const score = calculateSeoScore(findings);
```

## Keyword Research

### Features
- Discovery via provider (DataForSEO related_keywords)
- Related keywords, search volume, CPC, competition, difficulty
- Search intent (informational, navigational, commercial, transactional)
- SERP features
- Country, language, trend, competitor keywords, keyword gap
- Clustering: semantic similarity, intent, topic, SERP overlap

### Provider Abstraction
```ts
interface SearchProvider {
  getKeywords(seed, options): Promise<KeywordData[]>
}
```

DataForSEO implementation uses `/dataforseo_labs/google/related_keywords/live`

### No Fake Data
If provider not configured, keywords can still be added without enrichment, UI shows "Not Configured" for volume/difficulty.

## SERP Engine

### Provider Abstraction
```ts
interface SearchProvider {
  search(query, options): Promise<SerpResult>
}
```

Supports DataForSEO and SerpApi, configurable.

Stores: query, engine, country, language, device, timestamp, results, SERP features, provider, request ID.

## Rank Tracking

Tracks: keyword, position, URL, search engine, country, language, device, date

Supports: Desktop, Mobile

Tracks: Top 3, Top 10, Top 20, Top 50, Top 100

Detects: gains, losses, new rankings, lost rankings, cannibalization, SERP feature changes

Historical charts via rankings table.

## Competitor Analysis

- Discovery via DataForSEO competitors_domain
- Manual competitors
- Automatic discovery
- Keyword overlap, keyword gap, top pages, backlinks, ranking comparison, visibility comparison, content comparison

## Backlink System

- Backlinks, referring domains, anchor text, destination page, first_seen, last_seen, lost, new, competitor backlinks
- Provider abstraction (DataForSEO backlinks)
- New/lost detection via first_seen/last_seen

## GSC Integration

- OAuth flow (Google OAuth)
- Import: clicks, impressions, CTR, average position, queries, pages, countries, devices, search appearance
- Features: striking distance (position 11-20), declining pages/queries, cannibalization detection, content decay, opportunity detection
- Tokens encrypted at rest

## GA4 Integration

- OAuth/API
- Import: users, sessions, organic traffic, landing pages, conversions, revenue
- Correlate SEO data with analytics

## PageSpeed / Core Web Vitals

- PageSpeed Insights API integration
- Track: LCP, INP, CLS, Performance, Accessibility, Best Practices, SEO
- Historical snapshots

## Schema Detection

- Detect JSON-LD, Microdata, RDFa
- Validate common types: Article, Product, Organization, LocalBusiness, FAQ, Breadcrumb, WebSite, Person
- Show: Detected, Valid, Invalid, Missing

## Sitemap

- Detection via robots.txt and /sitemap.xml
- Parsing, sitemap index support, URL comparison, orphan URL detection, health, last modification

## Internal Linking

- Internal link graph from crawl
- Orphan pages (no incoming internal links)
- Pages with few links, overlinked pages, anchor text analysis
- AI may suggest links, but explainable

## Content Engine

- AI-assisted: article briefs, outlines, titles, meta descriptions, FAQs, content improvement, refresh, keyword placement, semantic topics, internal linking suggestions
- No guaranteed rankings, no spam at scale by default, quality controls
- Provider abstraction for AI

## GEO (Generative Engine Optimization)

- Track brand visibility in AI answers (ChatGPT, Gemini, Perplexity)
- Track: brand mention, competitor mention, citation, cited source, prompt, answer, visibility, share of voice, sentiment
- Distinguish measured data from interpretation

## AEO (Answer Engine Optimization)

- Question opportunities, answer coverage, FAQ, structured data, entity signals, citation opportunities, featured snippets, AI answer visibility

## AI Provider Abstraction

Interface with metering:
```ts
interface AIProvider {
  complete(prompt, options): Promise<{content, inputTokens, outputTokens, cost, latency}>
}
```

Providers: OpenAI, Anthropic, Google, OpenRouter, Perplexity
All operations metered, integrated with credit system.

## Data Quality

Every metric stores: provider, timestamp, request ID, country, language, device, source
No mixing contexts without labeling
