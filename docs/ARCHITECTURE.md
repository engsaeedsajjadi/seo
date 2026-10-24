# RankForge — Architecture Documentation

## Overview

RankForge is a commercial SEO Automation SaaS platform built with a modular monorepo architecture supporting both cloud-hosted and self-hosted deployment modes.

**Product Identity:** RankForge — Production-ready SEO automation comparable to Semrush, Ahrefs, SE Ranking, Sitebulb, with modern AI layer.

## Technology Stack

### Frontend
- **Framework:** React 18 + TypeScript + Vite 6
- **Styling:** Tailwind CSS 4 + shadcn/ui patterns
- **Routing:** React Router v6 with project-scoped routes `/projects/:projectId/*`
- **State:** React Context API + typed API client
- **Charts:** Recharts
- **Icons:** Lucide React
- **Animations:** Framer Motion

### Backend
- **Runtime:** Node.js 20 + Express 4
- **Validation:** Zod schemas on all endpoints
- **Auth:** JWT + bcryptjs (12 rounds), Better Auth pattern for OAuth
- **Database:** PostgreSQL 16 + Drizzle ORM (with in-memory fallback for dev)
- **Queue:** BullMQ pattern + in-memory fallback, pg-boss ready
- **Crawler:** Native HTTP + Cheerio, Playwright optional for JS rendering
- **Security:** Helmet, CORS, rate limiting, SSRF protection, encryption at rest

### Providers (Abstracted)
- **SEO Data:** DataForSEO (primary), SerpApi (alternative) — interface `SearchProvider`
- **AI:** OpenAI, Anthropic, Google, OpenRouter, Perplexity — interface `AIProvider`
- **Payments:** Stripe with webhook verification
- **Storage:** S3-compatible
- **Google:** GSC OAuth, GA4 OAuth, PageSpeed Insights

### Infrastructure
- **Containers:** Docker multi-stage, non-root user, health checks
- **Compose:** web (nginx), api, postgres, redis
- **CI/CD:** GitHub Actions (lint, typecheck, build, docker, security scan)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│  Web App (React/Vite)  │  Client Portal  │  API Consumers       │
│  HashRouter + Context  │  Restricted RBAC│  API Keys + MCP      │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                       API LAYER                                  │
├─────────────────────────────────────────────────────────────────┤
│  REST API v1  │  MCP Server  │  Webhooks  │  Health Checks     │
│  /api/v1/*    │  /mcp/*      │  Signed    │  /health           │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│  Auth & RBAC  │  Multi-Tenancy  │  Rate Limiting  │  Audit Log │
│  JWT + bcrypt │  org_id scoping │  100/15min      │  All ops   │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                     DOMAIN SERVICES                              │
├──────────┬──────────┬──────────┬──────────┬─────────────────────┤
│ Crawler  │ Audit    │ Keywords │ Rankings │ Competitors         │
│ SSRF-safe│ 13 rules │ Provider │ History  │ Gap analysis        │
├──────────┼──────────┼──────────┼──────────┼─────────────────────┤
│ Backlinks│ Content  │ GEO/AEO  │ Reports  │ Alerts              │
│ New/Lost │ AI briefs│ AI vis   │ PDF/CSV  │ Rule engine         │
└──────────┴──────────┴──────────┴──────────┴─────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                   PROVIDER ABSTRACTION                           │
├──────────┬──────────┬──────────┬──────────┬─────────────────────┤
│SerpProv. │ AIProv.  │BacklinkP.│AnalyticsP│ StorageP.           │
│DataForSEO│ OpenAI   │ DataForSEO│ GSC/GA4 │ S3                  │
│SerpApi   │ Anthropic│          │ PageSpeed│                     │
└──────────┴──────────┴──────────┴──────────┴─────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    INFRASTRUCTURE                                │
├──────────┬──────────┬──────────┬──────────┬─────────────────────┤
│PostgreSQL│ pg-boss  │ S3       │ Redis    │ Docker              │
│RLS       │ Queue    │ Reports  │ Cache    │ Compose             │
└──────────┴──────────┴──────────┴──────────┴─────────────────────┘
```

## Multi-Tenancy Model

```
User
└── Organization (tenant)
    ├── Members (with roles: Owner, Admin, Manager, SEO_Manager, Analyst, Editor, Client, Viewer)
    ├── Subscription & Credits (wallet, transactions)
    ├── Projects (websites)
    │   ├── Keywords (with clustering)
    │   ├── Rankings (historical)
    │   ├── Audit Findings (rule engine)
    │   ├── Crawl Runs & Pages
    │   ├── Backlinks (new/lost)
    │   ├── Competitors
    │   ├── Reports (PDF/HTML/CSV/JSON)
    │   ├── Jobs (crawl, rank_check, etc)
    │   └── Integrations (GSC, GA4, PageSpeed)
    ├── Clients (agency mode)
    ├── API Keys (scoped, expiring)
    ├── Webhooks (signed)
    └── White-Label Config (logo, colors, domain)
```

### Tenant Isolation
- **Application Level:** Every query scoped by `organization_id` resolved from auth session (JWT). Never trust client-provided org/project IDs.
- **Database Level:** PostgreSQL RLS policies on all tenant-scoped tables (see schema.sql)
- **API Level:** Middleware validates ownership before any operation
- **MCP Level:** Every tool requires organizationId and enforces isolation

## Provider Abstraction

```typescript
interface SearchProvider {
  search(query, options): Promise<SerpResult>
  getKeywords(seed, options): Promise<Keyword[]>
  getBacklinks(domain): Promise<Backlink[]>
  getCompetitors(domain): Promise<string[]>
}

interface AIProvider {
  complete(prompt, options): Promise<AIResponse> // metered
}
```

Implementations: DataForSEOProvider, SerpApiProvider, OpenAIProvider, AnthropicProvider, GoogleProvider, OpenRouterProvider, PerplexityProvider.

Provider failures produce explicit states: `not_configured`, `error`, `rate_limited` — never fake data.

## Worker Architecture

```
HTTP Request → Create Job Record (DB) → Queue → Worker Process
                                                    │
                                          ┌─────────┴─────────┐
                                          │  Job Execution     │
                                          │  ├─ Retry (exp backoff) │
                                          │  ├─ Rate Limiting  │
                                          │  ├─ Timeout (5min) │
                                          │  ├─ Idempotency    │
                                          │  └─ Dead Letter    │
                                          └───────────────────┘
                                                    │
                                          Store Result → Notify (webhook/alert)
```

Jobs: SITE_CRAWL, RANK_CHECK, KEYWORD_REFRESH, BACKLINK_REFRESH, GSC_SYNC, GA4_SYNC, PAGESPEED_CHECK, COMPETITOR_CHECK, AI_VISIBILITY_CHECK, REPORT_GENERATION, ALERT_PROCESSING

## Security Model

- **SSRF Protection:** Block private IPs (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, ::1, fc00::/7), DNS validation, re-validate after redirects, protocol whitelist
- **Input Validation:** Zod schemas on all API inputs
- **Auth:** Secure cookies, bcrypt 12, JWT, rate limiting, brute-force protection
- **Secrets:** AES-256-GCM encryption at rest, never logged, never returned to frontend
- **Headers:** Helmet (CSP, HSTS, etc)
- **Audit Logs:** All state-changing operations logged with org/user/action

## Crawler

- Real HTTP crawler with Cheerio
- robots.txt parsing, sitemap.xml parsing (including index)
- Configurable depth, concurrency (max 10), delay, user-agent
- SSRF protection on every request + redirect
- Handles: title, meta, headings, images alt, links, hreflang, structured data, canonical, noindex, response time, content-type

## Audit Engine

- Modular rules: each rule is separate with id, severity, category, check function
- 13+ rules: missing_title, duplicate_title, title_too_long, missing_meta_description, missing_h1, thin_content, images_without_alt, broken_links, noindex_pages, missing_canonical, slow_pages, missing_structured_data, insecure_links
- Severity: critical, high, medium, low, notice
- Categories: crawlability, indexability, metadata, content, links, images, performance, security, structured_data, international
- Transparent scoring: 100 - deductions (critical 10, high 5, medium 2, low 1)

## Billing & Credits

- **Plans:** FREE, STARTER, PRO, AGENCY, ENTERPRISE with configurable limits (projects, keywords, pages, rank checks, AI ops, reports, users, API requests, competitors)
- **Stripe:** Checkout sessions, subscriptions, webhook verification (signature), invoices, grace period
- **Credits:** Wallet (balance, total_granted, total_consumed), transactions (grant, consumption, refund, expiry), auditable
- **Usage:** Per-operation metering (crawl_pages, serp_calls, keyword_calls, backlink_calls, ai_tokens, reports, api_calls), dashboards, warnings

## Agency Mode

- Organization can create Clients (isolated)
- Each client has projects
- Agency can manage clients, assign projects, invite users, generate white-label reports
- White-label: custom logo, colors, company name, favicon, email sender, report branding, custom domain, login branding — never leaks between orgs
- Client Portal: Restricted view (SEO score, traffic, rankings, issues, progress, reports, recommendations) — no admin permissions

## API & MCP

- **REST API v1:** Versioned, scoped, rate-limited, Zod validated, tenant-isolated
  - /api/v1/projects, /sites, /audits, /keywords, /rankings, /competitors, /backlinks, /reports, /usage, /organizations, /api-keys, /webhooks, /billing, /clients, /mcp
- **API Keys:** Create, revoke, scopes, expiration, prefix, hash, last_used
- **Webhooks:** Outbound, signed with HMAC-SHA256, retry with exponential backoff, events (project.created, audit.completed, rank.updated, critical_issue.created, report.generated, subscription.updated, payment.failed, credit.low)
- **MCP Server:** Separate process on port 3002, tools for projects, audits, keywords, SERP, rankings, competitors, backlinks, GSC, reports, AI visibility — tenant-isolated

## Deployment

### Docker Compose (Self-Hosted)
```yaml
services:
  postgres: PostgreSQL 16 with health check
  redis: Redis for queue (optional)
  api: Node.js API server (port 3001)
  worker: Background worker
  mcp: MCP server (port 3002)
  web: Nginx serving React build (port 3000)
```

### Cloud (SaaS Mode)
- Container orchestration (Kubernetes/ECS)
- Managed PostgreSQL
- CDN for static assets
- Separate worker pool scaling
- S3 for reports

## Environment

See `.env.example` for all variables:
- DATABASE_URL, REDIS_URL
- JWT_SECRET, ENCRYPTION_KEY
- DATAFORSEO_LOGIN/PASSWORD, SERPAPI_KEY
- OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_AI_API_KEY, OPENROUTER_API_KEY, PERPLEXITY_API_KEY
- GOOGLE_CLIENT_ID/SECRET, PAGESPEED_API_KEY
- STRIPE_SECRET_KEY/WEBHOOK_SECRET
- S3_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET
- APP_URL, CORS_ORIGINS, etc.

## No Fake Data Principle

- When provider not configured: show "Not Configured" state
- Never hardcode SEO scores, traffic, keyword volume, backlinks, rankings, GSC stats, AI visibility
- Tests may use fixtures, production never falls back to fake data
- Every externally sourced metric stores provider, timestamp, request ID, country, language, device, source
