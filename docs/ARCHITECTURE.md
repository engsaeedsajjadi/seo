# RankForge — Architecture Documentation

## Overview

RankForge is a commercial SEO Automation SaaS platform built with a modular architecture that supports both cloud-hosted and self-hosted deployment modes.

## Technology Stack

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS 4
- **Routing**: React Router v6
- **Charts**: Recharts
- **Icons**: Lucide React
- **Animations**: Framer Motion

### Backend (Production)
- **Runtime**: Node.js + Next.js Route Handlers
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Better Auth (self-hostable)
- **Queue**: pg-boss (PostgreSQL-native job queue)
- **Storage**: S3-compatible object storage

### External Providers (Abstracted)
- **SEO Data**: DataForSEO (primary), SerpApi (alternative)
- **AI**: OpenAI, Anthropic, Google, OpenRouter, Perplexity
- **Payments**: Stripe
- **Analytics**: Google Search Console, Google Analytics 4
- **Monitoring**: Sentry, PostHog

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│  Web App (React/Next.js)  │  Client Portal  │  API Consumers   │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                       API LAYER                                  │
├─────────────────────────────────────────────────────────────────┤
│  REST API v1  │  MCP Server  │  Webhooks  │  GraphQL (future)  │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│  Auth & RBAC  │  Multi-Tenancy  │  Rate Limiting  │  Audit Log │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                     DOMAIN SERVICES                              │
├──────────┬──────────┬──────────┬──────────┬─────────────────────┤
│ Crawler  │ Audit    │ Keywords │ Rankings │ Competitors         │
├──────────┼──────────┼──────────┼──────────┼─────────────────────┤
│ Backlinks│ Content  │ GEO/AEO  │ Reports  │ Alerts              │
└──────────┴──────────┴──────────┴──────────┴─────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                   PROVIDER ABSTRACTION                           │
├──────────┬──────────┬──────────┬──────────┬─────────────────────┤
│SerpProv. │ AIProv.  │BacklinkP.│AnalyticsP│ StorageP.           │
└──────────┴──────────┴──────────┴──────────┴─────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    INFRASTRUCTURE                                │
├──────────┬──────────┬──────────┬──────────┬─────────────────────┤
│PostgreSQL│ pg-boss  │ S3       │ Redis*   │ Docker              │
└──────────┴──────────┴──────────┴──────────┴─────────────────────┘
* Redis only if needed for caching/pub-sub
```

## Multi-Tenancy Model

```
User
└── Organization (tenant)
    ├── Members (with roles)
    ├── Subscription & Credits
    ├── Projects (websites)
    │   ├── Keywords
    │   ├── Rankings
    │   ├── Audit Findings
    │   ├── Backlinks
    │   ├── Reports
    │   └── Integrations
    ├── API Keys
    ├── Webhooks
    └── White-Label Config
```

### Tenant Isolation
- Application-level: Every query scoped by organization_id resolved from auth session
- Database-level: PostgreSQL RLS policies on all tenant-scoped tables
- Never trust client-provided organization_id, project_id, or user_id

## Provider Abstraction

Each external data type has an interface:

```typescript
interface SerpProvider {
  search(query: string, options: SearchOptions): Promise<SerpResult>;
  getKeywords(seed: string[], options: KeywordOptions): Promise<Keyword[]>;
  getBacklinks(domain: string): Promise<Backlink[]>;
}

interface AIProvider {
  complete(prompt: string, options: AIOptions): Promise<AIResponse>;
  // All operations are metered for cost tracking
}
```

Implementations: DataForSEOProvider, SerpApiProvider, OpenAIProvider, AnthropicProvider, etc.

## Worker Architecture

```
HTTP Request → Create Job Record → pg-boss Queue → Worker Process
                                                        │
                                              ┌─────────┴─────────┐
                                              │  Job Execution     │
                                              │  ├─ Retry Logic    │
                                              │  ├─ Rate Limiting  │
                                              │  ├─ Idempotency    │
                                              │  └─ Dead Letter    │
                                              └───────────────────┘
                                                        │
                                              Store Result → Notify User
```

## Security Model

- SSRF Protection: Block private IPs, revalidate after redirects
- Input Validation: Zod schemas on all API inputs
- Auth: Secure cookies, CSRF protection, rate limiting
- Secrets: Encrypted at rest, never logged, never returned to frontend
- Audit Logs: All state-changing operations logged

## Deployment

### Docker Compose (Development/Self-Hosted)
```yaml
services:
  web:       # Next.js application
  worker:    # Background job processor
  postgres:  # Database + job queue
```

### Cloud (SaaS Mode)
- Container orchestration (Kubernetes/ECS)
- Managed PostgreSQL
- CDN for static assets
- Separate worker pool scaling
