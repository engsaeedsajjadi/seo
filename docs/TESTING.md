# RankForge — Testing Documentation

## Testing Strategy

### Unit Tests
- **SEO rules:** Each audit rule tested with fixtures (missing title, duplicate, etc)
- **Crawler:** URL parser, normalization, SSRF protection, robots.txt parsing
- **SSRF:** Blocked IPs, DNS rebinding, redirect validation, protocol abuse
- **Scoring:** Transparent score calculation from findings
- **Keyword clustering:** Semantic similarity, intent grouping
- **Credit system:** Grant, consumption, refund, balance tracking
- **Billing logic:** Plan limits, canPerformAction
- **Permissions:** RBAC hierarchy

### Integration Tests
- **Database:** Migrations, RLS policies, tenant isolation
- **Auth:** Signup, login, JWT, session revocation, OAuth flow
- **GSC:** OAuth, metrics import (mocked provider)
- **Provider adapters:** DataForSEO, SerpApi, AI providers (mocked HTTP)
- **Worker:** Job creation, execution, retry, dead-letter
- **Scheduler:** Cron, timezone
- **Stripe webhooks:** Signature verification, subscription updates
- **API:** All endpoints with auth, tenant isolation, validation

### E2E Tests
Flow:
1. Signup → Create organization
2. Login
3. Create project → Enter domain → Verify (optional)
4. Configure country/language
5. Optional GSC connection (mocked)
6. Initial crawl → Run audit → View results (real crawler with SSRF)
7. Add keywords → Run rank tracking (requires provider, else not_configured state)
8. Competitor analysis
9. Generate report (PDF/HTML/CSV/JSON)
10. Scheduled automation
11. Notifications
12. Subscription creation (Stripe test mode)
13. Credit consumption
14. Agency creation → Client creation → White-label config
15. Client login (restricted portal)
16. API key creation → API request
17. MCP request (tenant-isolated)

### Security Tests
- SSRF (private IPs, localhost, metadata, DNS rebinding, redirects, protocol abuse)
- IDOR (cross-tenant read/write/delete)
- Broken access control (RBAC bypass)
- Cross-tenant access (API keys, reports, jobs, billing)
- XSS (stored, reflected)
- CSRF (state-changing without token)
- SQL injection (parameterized queries)
- Rate limiting (brute force)
- Session fixation
- Webhook spoofing (invalid signature)
- Secret exposure (logs, responses)

### Performance Tests
- Dashboard loads without full dataset (pagination)
- Crawler concurrency-controlled (max 10)
- SERP providers rate-limited
- AI calls bounded and metered
- API response time < 200ms for simple queries
- Crawl 100 pages < 2 minutes with 3 concurrency

## Running Tests

### Frontend
```bash
npm run typecheck
npm run build
```

### Backend
```bash
cd apps/api
npm run build
npm test (when implemented with vitest/jest)
```

### Docker
```bash
docker compose up -d
# Run E2E against http://localhost:3000
```

## Test Data

- Production code never uses fake data
- Tests use controlled fixtures
- Provider mocks return deterministic data
- No random numbers in production
- No hardcoded SEO scores

## Coverage Goals

- Unit: 80%+
- Integration: 70%+
- E2E: Critical flows covered
- Security: All mandatory tests implemented

## CI Integration

GitHub Actions runs:
- install
- lint
- typecheck
- unit tests
- integration tests
- build
- security checks (npm audit, trufflehog)
- docker build

Never deploy if mandatory checks fail.
