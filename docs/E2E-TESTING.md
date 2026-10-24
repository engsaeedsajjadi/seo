# E2E Testing Documentation - RankForge

## Overview

RankForge E2E tests verify full production flow: Browser → Frontend → API → PostgreSQL → Queue → Worker → Crawler → Audit → Report

## Test Types

### 1. Real Production Flow (Playwright)

**File**: `tests/e2e/production-flow.spec.ts`

**Requirements**:
- PostgreSQL test database
- Redis (optional)
- API server running
- Frontend running
- Playwright chromium

**Flow Tested**:
```
Signup (unique user)
→ Login
→ Create Organization (auto on signup)
→ Create Project (domain validation, SSRF check, plan limits)
→ SSRF protection (localhost, 127.0.0.1, private IPs blocked)
→ Start Crawl (API creates crawl_runs + jobs SITE_CRAWL)
→ Worker claims job (FOR UPDATE SKIP LOCKED)
→ Crawler runs (HTTP+Cheerio+robots.txt+SSRF)
→ Persist crawl_pages + crawl_issues
→ SEO Audit (13 rules deterministic)
→ Score calculation (100 - critical*10 - high*5 - ...)
→ Keywords CRUD
→ Rankings PROVIDER_NOT_CONFIGURED (no fake data)
→ Backlinks PROVIDER_NOT_CONFIGURED
→ GSC NOT_CONNECTED (no fake metrics)
→ Reports generation (real data_snapshot)
→ OpenAPI spec
→ Billing credits real
→ Tenant isolation cross-tenant blocked
→ Logout
```

**Running**:
```bash
# Install Playwright
npx playwright install --with-deps chromium

# Start services (requires DATABASE_URL)
npm run db:migrate --prefix apps/api
npm run build --prefix apps/api
npm start --prefix apps/api &

npm run dev & # Frontend

# Run E2E
npx playwright test tests/e2e/production-flow.spec.ts
# Or via npm
npm run test:e2e
```

**CI**:
- Uses postgres:15 + redis:7 services
- Runs db:migrate
- Starts API server
- Runs Playwright
- Uploads artifacts: html report, screenshots, trace, video on failure

### 2. Persian RTL E2E

**File**: `tests/e2e/rtl-persian.test.ts`

**Tests** (8 tests):
- HTML lang="fa" dir="rtl"
- Vazirmatn font in index.html + CSS
- Persian calendar Intl.DateTimeFormat fa-IR-u-ca-persian → ۲۶ اردیبهشت ۱۴۰۳
- Persian numbers ۰۱۲۳ + Intl.NumberFormat fa-IR ۱٬۲۳۴٬۵۶۷
- Currency Toman ۵۰٬۰۰۰ تومان Rial ۵۰۰٬۰۰۰ ریال
- i18n coverage 20 modules 2366 keys
- RTL logical properties [dir="rtl"]
- Accessibility Persian aria-label

**Running**:
```bash
npx tsx tests/e2e/rtl-persian.test.ts
npm run i18n:audit
```

**Result**: PASS - 2366 keys, 0 hardcoded, RTL active, Vazirmatn, calendar, numbers, Toman/Rial

### 3. Integration Tests

**Real PostgreSQL Tests** (when DATABASE_URL set):

- `job-concurrency.test.ts` - FOR UPDATE SKIP LOCKED
  - Two workers claiming concurrently never duplicate
  - Single job contention only one worker gets it
  - execution_id unique per claim

- `credit-ledger.test.ts` - Atomic credit ledger
  - Concurrent deductions no double-spend
  - Idempotency same key no double deduction
  - Insufficient balance rejected
  - CHECK constraint prevents negative

**Code Pattern Tests** (when DB not available):

- `ssrf-e2e.test.ts` - 13 private IPs blocked, 17 blocked URLs, 4 allowed
- `crawl-safety.test.ts` - robots.txt, AbortController, max pages/depth, concurrency, fixture site 6 files
- `seo-audit.test.ts` - 6+ rules, deterministic scoring, fixture validation
- `idempotency.test.ts` - Jobs, credits, webhooks, reports, payments
- `api-contract.test.ts` - Health, ready, version, auth, projects, billing, api-keys, rankings, backlinks, GSC, GA4, OpenAPI

**Running**:
```bash
npm run test:integration
```

### 4. Security Tests

- `tenant-isolation.test.ts` - Tenant isolation
- `cross-tenant.test.ts` - A-F: project, ID manipulation, API key, webhook, report, job
- `rls-postgres.sql` - RLS ENABLE + policies + RAISE EXCEPTION strict with non-owner role

**Running**:
```bash
npm run test:security
```

### 5. Unit Tests

- `ssrf.test.ts` - SSRF private IP blocking
- `audit.test.ts` - Audit rules
- `credit.test.ts` - Credit ledger logic
- `job-atomic.test.ts` - FOR UPDATE SKIP LOCKED simulation
- `credit-atomic.test.ts` - No double-spend, no negative
- `timeout.test.ts` - AbortController vs Promise.race

**Running**:
```bash
npm run test:unit
```

## Fixture Site

**Location**: `tests/fixtures/site/`

Real site with SEO issues for testing crawler + audit:

- `index.html` - Good page with H1, meta, alt, broken link, external link
- `about.html` - Good page
- `products.html` - Duplicate title + multiple H1
- `contact.html` - Missing title
- `robots.txt` - Allow / Disallow /private/ Sitemap
- `sitemap.xml` - 4 URLs

**Purpose**:
- Test crawler discovers pages, respects robots.txt, follows sitemap
- Test audit finds missing-title, duplicate-title, multiple-h1, missing-alt, broken-link

## Test Database Isolation

- Uses `TEST_DATABASE_URL` or `DATABASE_URL` with `rankforge_test` DB
- Disposable test database
- Cleanup after tests: DROP test tables or disposable DB
- Tests independent, no global mutable state

## Parallel Safety

- Playwright workers=1 in CI, 2 locally
- Each test uses unique user/org/project (Date.now() + random)
- No shared state

## Failure Diagnostics

On failure, CI uploads:
- HTML report
- Screenshots
- Trace
- Video on failure/retry
- Server logs
- Worker logs
- Database relevant state

## Running Full Suite

```bash
npm ci
npm run lint -- --max-warnings=0
npm run typecheck
npm run test:unit
npm run test:security
npm run test:integration
npm run test:e2e
npm run build
```

## CI Integration

**.github/workflows/ci.yml** includes:
- lockfile-integrity: npm ci + git diff verification
- frontend: build + i18n:audit
- api, worker, mcp: builds
- lint-typecheck: lint 0 warnings + typecheck
- unit-tests, security-tests
- integration: postgres:15 + redis:7 + migrate + RLS test
- e2e: postgres + redis + playwright install + API start + test:e2e + artifacts
- docker: build 4 images + compose up + health check
- security: audit high + trufflehog

No `continue-on-error` or `|| true` hiding critical checks.

## Known Limitations

See `docs/PRODUCTION-READINESS.md` section D.

Providers without credentials correctly return PROVIDER_NOT_CONFIGURED, not fake data.

## Evidence

All E2E have:
- Test output
- Build output
- Database assertions (when DB available)
- HTTP response checks
- Browser assertions (Playwright)
- Artifacts in CI

No "implemented in code" or "should work" - only real execution.
