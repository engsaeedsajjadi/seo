# RankForge — Deployment Guide

## Quick Start (Docker Compose)

### Prerequisites
- Docker & Docker Compose
- Domain with SSL (for production)
- External credentials (optional, see below)

### 1. Clone
```bash
git clone https://github.com/engsaeedsajjadi/seo.git
cd seo
```

### 2. Configure
```bash
cp .env.example .env
# Edit .env with your secrets
```

Minimum required for basic operation:
```bash
DATABASE_URL=postgresql://rankforge:password@postgres:5432/rankforge
JWT_SECRET=your-jwt-secret-min-32-chars-change-in-production
ENCRYPTION_KEY=your-encryption-key-32-chars-min
APP_URL=http://localhost:3000
```

Optional providers (features show "Not Configured" if missing):
```bash
DATAFORSEO_LOGIN=
DATAFORSEO_PASSWORD=
SERPAPI_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_AI_API_KEY=
OPENROUTER_API_KEY=
PERPLEXITY_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
PAGESPEED_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
S3_ENDPOINT=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=
```

### 3. Start
```bash
docker compose up -d
```

Services:
- web: Frontend nginx on :3000
- api: Backend API on :3001
- postgres: PostgreSQL 16 on :5432
- redis: Redis for queue on :6379 (optional)
- worker: Background worker (same image as api, different command)
- mcp: MCP server on :3002 (optional)

### 4. Access
- Web: http://localhost:3000
- API: http://localhost:3001/api/v1
- Health: http://localhost:3001/api/v1/health
- MCP: http://localhost:3002/health

### 5. Run Migrations
```bash
docker compose exec api npm run db:migrate
# Or if using in-memory fallback, no migration needed for dev
```

## Production Deployment

### Docker Build
```bash
docker build -t rankforge-web .
docker build -t rankforge-api apps/api/
```

### Environment Variables

Production must set:
- NODE_ENV=production
- DATABASE_URL (managed PostgreSQL)
- JWT_SECRET (32+ chars, random)
- ENCRYPTION_KEY (32+ chars, random)
- APP_URL (https://your-domain.com)
- CORS_ORIGINS (https://your-domain.com)

### Security Checklist
- [ ] No secrets in repository
- [ ] JWT_SECRET rotated from default
- [ ] ENCRYPTION_KEY set and backed up securely
- [ ] DATABASE_URL uses strong password
- [ ] CORS_ORIGINS restricted to your domain
- [ ] Stripe webhook secret verified
- [ ] S3 bucket private, not public
- [ ] Helmet headers enabled (default)
- [ ] Rate limiting enabled (default)
- [ ] SSRF protection enabled (default)

### Cloud Providers

#### Railway / Render / Fly.io
- Use Dockerfile
- Set environment variables in dashboard
- Managed PostgreSQL addon
- Deploy api and web separately or as monolith

#### VPS (Hetzner, DigitalOcean, etc)
```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Clone and configure
git clone https://github.com/engsaeedsajjadi/seo.git
cd seo
cp .env.example .env
nano .env

# Start with production compose
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Setup Nginx reverse proxy with SSL (Let's Encrypt)
# Example nginx.conf included
```

#### Kubernetes
- Deployment manifests in `docker/` folder
- Use secrets for env vars
- Liveness/readiness probes: /api/v1/health/live and /ready
- Horizontal scaling: api (stateless), worker (scaled by queue depth)

### CI/CD

GitHub Actions workflow in `.github/workflows/ci.yml`:
- On push to main: install, lint, typecheck, unit tests, build, docker build, security scan
- Production pipeline: test → build → container → scan → push → deploy → migration → health check
- Never deploy if mandatory checks fail

### Monitoring

- **Logs:** Structured JSON logs with request ID, org ID, project ID
- **Sentry:** Set SENTRY_DSN for error tracking
- **PostHog:** Set POSTHOG_KEY for product analytics
- **Health:** /api/v1/health returns service status

### Backups

- **Database:** Daily pg_dump, 30-day retention, test restore quarterly
- **Storage:** S3 versioning enabled
- **Disaster Recovery:** Documented steps to restore from backup

### Scaling

- **API:** Stateless, horizontal scaling via load balancer
- **Worker:** Scale by queue depth, concurrency 5 default
- **Crawler:** Concurrency-controlled (max 10), delay 1s default, respects robots.txt
- **SERP Providers:** Rate-limited per provider
- **AI Calls:** Bounded, metered, credit-controlled

## Self-Hosted Enterprise Mode

- Same Docker Compose
- All data stays on your VPS
- No external calls unless providers configured
- Bring your own API keys (DataForSEO, OpenAI, etc)
- No seat limits
- White-label supported

## SaaS Cloud Mode

- Managed hosting
- Stripe billing
- Usage metering
- Multi-tenant isolation
- Agency mode + client portal
- White-label per organization
