# RankForge — Security Documentation

## Security Architecture

### 1. SSRF Protection

The crawler implements comprehensive SSRF protection:

**Blocked IP Ranges:**
- `127.0.0.0/8` — Loopback
- `10.0.0.0/8` — Private Class A
- `172.16.0.0/12` — Private Class B
- `192.168.0.0/16` — Private Class C
- `169.254.0.0/16` — Link-local (includes AWS metadata 169.254.169.254)
- `::1/128` — IPv6 loopback
- `fc00::/7` — IPv6 unique local
- `fe80::/10` — IPv6 link-local

**Protection Mechanisms:**
1. DNS resolution validation before connection
2. IP validation after DNS resolution
3. Re-validation after every redirect
4. Protocol whitelist (HTTP/HTTPS only)
5. Timeout enforcement
6. Response size limits

### 2. Tenant Isolation

**Application Level:**
- Every API endpoint resolves the organization_id from the authenticated session
- Client-provided organization_id/project_id parameters are ignored
- Middleware validates ownership before any operation

**Database Level:**
- PostgreSQL Row Level Security (RLS) policies
- Every tenant-scoped table has `organization_id` column
- Policies enforce: `organization_id = current_setting('app.current_org_id')`

**Test Coverage:**
- Cross-tenant read attempts → 403
- Cross-tenant write attempts → 403
- Cross-tenant delete attempts → 403
- API key from wrong org → 403

### 3. Authentication Security

- Password hashing: bcrypt with cost factor 12
- Session tokens: Cryptographically secure, HttpOnly, Secure, SameSite=Strict
- CSRF: Double-submit cookie pattern
- Rate limiting: 5 login attempts per minute per IP
- Brute force: Exponential backoff after failures
- 2FA: TOTP-based (optional)
- Session revocation: Immediate invalidation

### 4. API Security

- All inputs validated with Zod schemas
- Rate limiting per API key (configurable per plan)
- API key scopes restrict access
- Request/response logging (no secrets)
- CORS: Explicit origin whitelist
- Security headers: CSP, X-Frame-Options, X-Content-Type-Options

### 5. Secret Management

- Secrets encrypted at rest using AES-256-GCM
- Encryption key derived from ENCRYPTION_KEY env var
- Secrets never logged (structured logger filters sensitive fields)
- Secrets never returned in API responses
- Rotation support without downtime
- OAuth tokens stored encrypted

### 6. Webhook Security

- Outbound webhooks signed with HMAC-SHA256
- Signature in `X-RankForge-Signature` header
- Stripe webhooks verified with webhook secret
- Retry logic with exponential backoff
- Dead-letter after max retries

### 7. Input Validation

All user inputs are validated:
- URL validation with SSRF checks
- Domain validation
- Email validation
- SQL injection prevention (parameterized queries via Drizzle)
- XSS prevention (output encoding, CSP)
- File upload validation (type, size)

### 8. Audit Logging

Every state-changing operation is logged:
- Timestamp
- User ID
- Organization ID
- Action type
- Resource affected
- IP address
- User agent
- Request ID

Logs never contain: passwords, API keys, OAuth tokens, payment data.

### 9. Content Security Policy

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.rankforge.io;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
```

### 10. Dependency Security

- All dependencies audited for known vulnerabilities
- License compatibility verified (MIT, Apache-2.0, ISC compatible)
- No copyleft licenses in production dependencies
- Regular dependency updates via automated PRs
