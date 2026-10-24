# RankForge — Security Documentation

## Security Architecture Overview

RankForge implements defense-in-depth with multiple security layers.

## 1. SSRF Protection (Mandatory)

### Blocked IP Ranges
- `127.0.0.0/8` — Loopback
- `10.0.0.0/8` — Private Class A
- `172.16.0.0/12` — Private Class B
- `192.168.0.0/16` — Private Class C
- `169.254.0.0/16` — Link-local (includes AWS metadata 169.254.169.254)
- `0.0.0.0/8`, `100.64.0.0/10` (CGNAT), TEST-NET ranges
- `::1/128` — IPv6 loopback
- `fc00::/7` — IPv6 unique local
- `fe80::/10` — IPv6 link-local
- `ff00::/8` — Multicast

### Protection Mechanisms
1. **Protocol whitelist:** Only http/https allowed
2. **Hostname blocklist:** localhost, *.internal, *.local, metadata.google.internal
3. **DNS resolution validation:** Lookup hostname, check all returned IPs
4. **IP validation after DNS:** Block if any IP is private
5. **Re-validation after redirects:** Every redirect target validated
6. **Timeout enforcement:** 30s default, configurable
7. **Response size limits:** 10MB default
8. **Safe fetch wrapper:** `safeFetch()` used everywhere crawler makes requests

### Implementation
`packages/security/src/ssrf.ts` and `apps/api/src/lib/ssrf.ts`:
- `validateUrlForSSRF(url)` — validates before fetch
- `validateRedirectUrl(original, redirect)` — validates redirects
- `safeFetch(url, options)` — wrapper with all protections
- `isPrivateIP(ip)` — checks if IP is blocked

### Tests
- SSRF attempts to 127.0.0.1 → blocked
- SSRF attempts to 10.x.x.x → blocked
- SSRF attempts to 169.254.169.254 → blocked
- DNS rebinding (public DNS → private IP) → blocked
- Redirect to private IP → blocked
- Protocol abuse (file://, gopher://) → blocked

## 2. Tenant Isolation

### Application Level
- Every API endpoint resolves `organization_id` from authenticated JWT session
- Client-provided `organizationId`, `projectId`, `userId` parameters are ignored for authorization
- Middleware validates ownership: `project.organizationId === req.organizationId`
- All database queries scoped by organization_id

### Database Level
- PostgreSQL Row Level Security (RLS) policies (see `apps/api/db/schema.sql`)
- Every tenant-scoped table has `organization_id` column
- Policies enforce: `organization_id = current_setting('app.current_org_id')`
- Example:
```sql
CREATE POLICY project_isolation ON projects
  USING (organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = current_setting('app.current_user_id')::UUID
  ));
```

### Test Coverage
- User A cannot read User B data → 403
- User A cannot modify User B data → 403
- User A cannot delete User B data → 403
- User A cannot access User B reports → 403
- User A cannot use User B API key → 403
- User A cannot access User B storage → 403
- User A cannot access User B jobs → 403
- User A cannot access User B billing → 403

## 3. Authentication Security

- **Password hashing:** bcryptjs with cost factor 12
- **Session tokens:** JWT signed with HS256, 7d expiry, HttpOnly cookies optional
- **CSRF:** SameSite=Strict cookies, double-submit pattern where applicable
- **Rate limiting:** 10 login attempts per 15min per IP, 200 requests per 15min per IP
- **Brute force:** Exponential backoff after failures
- **2FA:** TOTP-based (optional, field in users table)
- **Session revocation:** Immediate invalidation via revokedAt
- **Email verification:** Token-based, field in users table
- **Password reset:** Token-based flow (to be implemented with email provider)

## 4. API Security

- **Input validation:** Zod schemas on all endpoints (body, query, params)
- **Rate limiting:** per-user, per-org, per-API-key (configurable per plan)
- **API key scopes:** Restrict access (read, write, admin)
- **Request/response logging:** Structured logs with request ID, org ID, user ID — no secrets logged
- **CORS:** Explicit origin whitelist from env, allows preview hosts (*.e2b.app) for development
- **Security headers:** Helmet.js (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, etc)
- **SQL injection:** Parameterized queries via pg, Drizzle ORM
- **XSS:** React escaping, CSP headers, output encoding
- **File upload:** Type and size validation (when implemented)

## 5. Secret Management

- **Encryption at rest:** AES-256-GCM with key derived from ENCRYPTION_KEY env var
- **Implementation:** `apps/api/src/lib/encryption.ts`
  - `encrypt(text)` → `iv:authTag:encrypted`
  - `decrypt(encryptedText)` → plaintext
  - `hashApiKey(key)` → SHA256 hash
  - `generateApiKey()` → key, hash, prefix
- **Secrets never logged:** Structured logger filters sensitive fields
- **Secrets never returned:** API responses never include plaintext secrets, only prefix
- **Rotation support:** Without downtime via key versioning (future)
- **OAuth tokens:** Stored encrypted (gsc_connections, ga4_connections)
- **API keys:** Stored as hash, only prefix visible

## 6. Webhook Security

- **Outbound webhooks:** Signed with HMAC-SHA256, signature in `X-RankForge-Signature` header
- **Stripe webhooks:** Verified with webhook secret using Stripe library
- **Retry logic:** Exponential backoff, dead-letter after max retries
- **Payload validation:** Zod schemas

## 7. RBAC

Roles (hierarchical):
- Owner (100) — full access
- Admin (80) — manage org, billing read
- Manager (60) — manage projects, team
- SEO_Manager (50) — SEO operations
- Analyst (40) — read + reports
- Editor (30) — content + keywords
- Client (20) — restricted portal
- Viewer (10) — read-only

Permissions granular:
- project.read, project.write, project.delete
- seo.audit.run, seo.audit.read
- keyword.read, keyword.write
- rank.read
- billing.read, billing.manage
- team.invite
- reports.generate
- api.manage

## 8. Audit Logging

Every state-changing operation logged:
- Timestamp
- User ID
- Organization ID
- Action type (user.signup, project.create, crawl.start, etc)
- Resource type and ID
- Details (non-sensitive)
- IP address
- User agent

Table: `audit_logs`

## 9. Security Tests (Mandatory)

Explicitly tested:
- SSRF (private IPs, metadata endpoint, DNS rebinding, redirects, protocol abuse)
- IDOR (cross-tenant access)
- Broken access control (RBAC bypass)
- XSS (stored, reflected via React escaping)
- CSRF (state-changing without token)
- SQL injection (parameterized queries)
- Rate limiting (brute force)
- Session fixation
- Webhook spoofing (invalid signature)
- Secret exposure (logs, responses)

## 10. Compliance

- **GDPR:** Data export, account deletion, organization deletion with cascade, retention policies, consent hooks, auditability. Billing records respect legal retention.
- **No secret committed:** .env never committed, .env.example has placeholders
- **No fake production data:** Real data only, explicit not_configured states

## 11. Monitoring

- Structured logs with request ID, org ID, project ID, provider request ID
- Error tracking (Sentry configurable)
- Metrics: latency, queue depth, failed jobs, provider failures, crawl failures, DB errors, billing errors
- Never log: passwords, API keys, OAuth tokens, payment secrets
