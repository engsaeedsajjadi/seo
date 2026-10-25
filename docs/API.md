# RankForge — API Documentation

## Base URL
- Local: http://localhost:3001/api/v1
- Production: https://api.your-domain.com/api/v1

## Authentication

### JWT Bearer
```
Authorization: Bearer <token>
```

Obtain token via:
- POST /api/v1/auth/signup
- POST /api/v1/auth/login

### API Keys
```
Authorization: Bearer rf_abc123...
```

Create via: POST /api/v1/api-keys (requires auth)

Scopes: `read`, `write` (request both when needed). Service keys are limited to permitted SEO/project/job operations; they cannot manage accounts, billing or administrative settings.

## Versioning
- Current: v1
- Header: Accept: application/json
- All routes under /api/v1/

## Rate Limiting
- 200 requests per 15 minutes per IP (general)
- 10 auth attempts per 15 minutes per IP
- The global IP limit also applies to service keys; project/report/team quotas are enforced separately. Test mode uses a higher auth limit for isolated automated suites.
- Headers: X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After

## Error Format
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Project not found",
    "details": {},
    "requestId": "req_123"
  }
}
```

Codes: UNAUTHENTICATED, SESSION_EXPIRED, FORBIDDEN, VALIDATION_ERROR, NOT_FOUND, CONFLICT, RATE_LIMITED, PROVIDER_NOT_CONFIGURED, PROVIDER_ERROR, LIMIT_REACHED, INSUFFICIENT_CREDITS, INTERNAL_ERROR

## Endpoints

### Health
- GET /health — service status
- GET /ready — database readiness
- GET /health/live — liveness

### Auth
- POST /auth/signup — {email, password, name} → {user, organization, token}
- POST /auth/login — {email, password} → {user, token}
- GET /auth/me — current user (auth required)
- POST /auth/logout — revoke the current server-side session
- POST /auth/refresh — rotate the HttpOnly refresh cookie and return a new 15-minute access token
- GET /auth/sessions — list this user's active sessions
- DELETE /auth/sessions/:id — revoke one of this user's sessions
- POST /auth/password — {currentPassword, password}; change the password and revoke all sessions
- POST /auth/forgot-password — {email}; request a one-hour recovery link (requires configured SMTP)
- POST /auth/reset-password — {token, password}; consume a recovery token and revoke all sessions
- POST /auth/organization — {organizationId}; create a session in a verified membership and revoke the previous session

Refresh credentials expire after 30 days and are never returned in JSON. Keep the response cookie; access tokens use `Authorization: Bearer`. Frontend and API must use the same site for the SameSite=Lax refresh cookie. Production requires HTTPS.

### Organizations
- GET /organizations/current — current org
- GET /organizations — list orgs for user
- PATCH /organizations/current — update org (name, settings; Owner/Admin only)
- PATCH /organizations/current/white-label — update permitted branding fields (Agency/Enterprise plan)

### Projects
- GET /projects — list projects in org
- GET /projects/:id — get project
- POST /projects — {name, domain, country, language, timezone, searchEngines, device} → project
- PATCH /projects/:id — update project
- DELETE /projects/:id — soft delete

### Crawl & Audit
- POST /projects/:projectId/crawl — {maxPages, maxDepth, concurrency, respectRobotsTxt} → job
- GET /projects/:projectId/audit/findings — list findings
- GET /projects/:projectId/audit/score — {overall, breakdown, lastCrawlAt}

### Keywords
- GET /projects/:projectId/keywords — list keywords
- POST /projects/:projectId/keywords — {keywords: string[], country, language, groupId} → keywords (enriched if provider configured)
- DELETE /projects/:projectId/keywords/:keywordId — delete

### Rankings
- GET /projects/:projectId/rankings — list rankings (historical)
- POST /projects/:projectId/rankings/check — trigger rank check job (requires provider)

### Competitors
- GET /projects/:projectId/competitors — list
- POST /projects/:projectId/competitors — {domain, autoDiscover} → competitor(s)

### Backlinks
- GET /projects/:projectId/backlinks — list
- POST /projects/:projectId/backlinks/sync — trigger refresh job (requires DataForSEO)

### Jobs
- GET /projects/:projectId/jobs — list jobs for project
- GET /jobs — list recent jobs for org

### Reports
- GET /projects/:projectId/reports — list
- POST /projects/:projectId/reports — {type, format, title?} → {report, job}; pending → completed/failed
- GET /projects/:projectId/reports/:reportId/download?format=json|csv|html — authenticated snapshot download; 409 before completion

Supported formats are `json`, `csv`, and printable `html`. Server-rendered PDF is not implemented and new PDF requests return 400. Supported types: seo, technical, keywords, rankings, competitors, backlinks, gsc, ga4, ai_visibility, executive, agency. Creation is transactional and enforces the monthly report quota. Downloads enforce tenant and client project access.

### Alerts
- GET /projects/:projectId/alerts — list alerts

### Integrations
- GET /integrations/status — provider status (connected/not_configured/error)

### Billing
- GET /billing/plans — list plans
- GET /billing/subscription — current subscription
- GET /billing/credits — wallet balance
- GET /billing/usage — usage records
- POST /billing/checkout — {planId, annual} → {url} (Stripe checkout)

### API Keys
- GET /api-keys — list (safe, no plaintext)
- POST /api-keys — {name, scopes, expiresAt} → {key (only once), ...}
- DELETE /api-keys/:id — revoke

### Webhooks
- GET /webhooks — list
- POST /webhooks — {url, events, secret} → webhook

### Clients (Agency)

### Content & AI
- POST /projects/:projectId/content/briefs — {keyword, targetWordCount} → brief (requires AI provider)
- GET /projects/:projectId/geo — GEO tracking (requires AI)
- GET /projects/:projectId/aeo — AEO tracking (requires AI)

### PageSpeed, GSC, GA4
- GET /projects/:projectId/pagespeed — PageSpeed results (requires API key)
- GET /projects/:projectId/gsc — GSC metrics (requires OAuth)

### Team
- GET /organizations/current/members — list members
- POST /organizations/current/members — {email, role}; add an existing registered account within the plan limit
- PATCH /organizations/current/members/:userId — {role}; privileged role change (Owner cannot be demoted)
- DELETE /organizations/current/members/:userId — remove a member and revoke tenant sessions (Owner cannot be removed)
- PUT /projects/:projectId/clients/:userId — grant a Client member access to this project
- DELETE /projects/:projectId/clients/:userId — revoke the assignment

Email invitations are not implemented; recipients must register first.

### MCP
- GET /mcp/tools — list MCP tools
- POST /mcp/call — {tool, params} → result; send Authorization: Bearer with an access JWT or scoped API key. Identity comes from the authenticated API, never from body userId/organizationId. MCP is served on its own origin/port (default 3002), not under /api/v1.

## Webhooks Events
- project.created
- audit.completed
- rank.updated
- critical_issue.created
- report.generated
- subscription.updated
- payment.failed
- credit.low

Webhook payload signed with HMAC-SHA256 in X-RankForge-Signature header.

## Pagination
Query params: ?page=1&perPage=20&sortBy=createdAt&sortOrder=desc
Response meta: {total, page, perPage, requestId}

## Tenant Isolation
Every endpoint resolves organizationId from auth token. Never trust client-provided org/project IDs. All queries scoped.

## No Fake Data
If provider not configured, endpoint returns:
```json
{
  "success": true,
  "data": [],
  "providerStatus": "not_configured",
  "message": "Requires DataForSEO configuration"
}
```
Never fabricated metrics.

## Examples

### Create Project
```bash
curl -X POST http://localhost:3001/api/v1/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Site","domain":"example.com","country":"US","language":"en"}'
```

### Add Keywords
```bash
curl -X POST http://localhost:3001/api/v1/projects/$PROJECT_ID/keywords \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"keywords":["seo tools","best seo software"]}'
```

### Run Crawl
```bash
curl -X POST http://localhost:3001/api/v1/projects/$PROJECT_ID/crawl \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"maxPages":50,"maxDepth":3}'
```
