# SaaS hardening release — 2026-10-25

Status: release candidate for staging. Public commercial release has NOT been verified.
This report supersedes older claims of "production ready" or "71/71" for the changes below.

## Delivered

- Same-origin API works with the supplied Nginx proxy and Vite dev/preview proxy.
- Typed and raw-response clients attach bearer credentials. Previously billing, API keys,
  competitors, backlinks, content, GEO, AEO and alerts used unauthenticated fetch calls.
- Access JWTs expire after 15 minutes; database-backed sessions expire after 30 days.
- Refresh credentials are opaque, hashed at rest, in HttpOnly/SameSite cookies and rotate
  on use. Reusing a consumed refresh credential revokes the session family.
- Refresh is single-flight per client and serialized between tabs with Web Locks.
- Logout revokes the server session, not merely browser storage. Password changes revoke
  every session. Users can list their own sessions and revoke other sessions.
- Password recovery delivers an SMTP email with a one-time hashed token valid for one hour. Reset revokes all sessions. Missing SMTP configuration returns 503.
- Origin checks protect login, signup, refresh and logout. Production requires HTTPS.
- Roles come from live organization membership, rather than stale JWT claims. Route
  policy applies in development and production. Malformed resource ids return 400.
- API keys now actually authenticate REST calls, enforce read/write scopes, expire and
  revoke. Keys cannot manage accounts, billing or administrative endpoints.
- MCP no longer accepts identity from request body. Calls go through the authenticated
  API so its project-assignment, role, quota and credit checks also apply to MCP.
- Tenant RLS policies replace the old permissive/recursive policies. A dedicated non-owner SQL test verifies tenant read/write isolation and denies an empty tenant context.
- Client users see only explicitly assigned projects. Assignment CRUD is tenant-bound;
  schema foreign keys prevent cross-organization assignments.
- Organization response includes real members and wallet, matching the frontend contract.
- Team UI loads real members, adds existing accounts subject to plan limits, and can
  assign/revoke client project access. API supports role changes and member removal;
  organization owners cannot be removed or demoted through these endpoints.
- Organization switching creates a new scoped session and revokes the previous one.
  The header shows the actual signed-in name/role. /auth/me returns the active tenant.
- Project pages resolve the URL id before mounting children; stale project content does
  not mount during resolution and an inaccessible project returns an error.
- Signup is atomic across user, organization, membership, wallet, audit and session.
- Project creation serializes plan count enforcement, persists the queued crawl atomically,
  and responds only after commit. Server plan configuration is read from plans.
- Settings save the organization name. Fake users, fake API keys and inactive security
  controls were replaced by real team/API links and session/password controls.
- Display plan defaults match the seed. Unsupported SSO/unlimited/SLA marketing promises
  were removed from the Enterprise seed feature list.
- TLS certificate verification is enabled when DATABASE_SSL=true. Environment files,
  browser results and reports are excluded from git.
- Docker migration, API, Worker and MCP now use the same database credential setting; Redis health checks authenticate and check PONG.
- Incremental migrations and their migration records commit together. CI now runs on
  fix/frontend-auth-ux and includes the SaaS regression suite.

## Upgrade

Back up the production database before upgrading. Install dependencies at the root and
in apps/api, apps/worker and apps/mcp with npm ci. Run the existing migration/seed process
before starting the new API. New migrations: drizzle/002_sessions_and_client_projects.sql , drizzle/003_password_recovery.sql and drizzle/004_strict_tenant_policies.sql.
The migrations add tables and replace tenant RLS policies; they do not delete existing user/project/billing records.
Old JWTs without a session id intentionally stop working. Users must sign in again.
No existing clients receive project access automatically: an owner/admin must assign it.

For single-origin Docker, leave VITE_API_URL empty at build time. For local split-origin
development use http://localhost:3001. For remote deployment never build a browser bundle
with a localhost API URL. APP_URL and CORS_ORIGINS must list the actual HTTPS frontend
origin. Refresh cookies use SameSite=Lax: use the same site for frontend and API;
unrelated frontend/API domains are not supported by this cookie configuration.

MCP uses API_INTERNAL_URL (default http://api:3001 in production,
http://127.0.0.1:3001 in development). Send Authorization: Bearer with a current access
JWT or supported scoped API key; userId/organizationId in the body are ignored.

## Validation and limits of evidence

- Frontend TypeScript/build, API/Worker/MCP TypeScript builds and ESLint were run locally.
- Existing unit/security/integration/static localization scripts were run. Some existing
  scripts use simulations or SQL-pattern fallbacks without DATABASE_URL. Their green
  output must not be represented as native PostgreSQL integration or browser proof.
- The added suites passed 47 backend/MCP/SQL/SMTP assertions and 10 frontend authentication assertions locally.
- npm run test:saas runs actual HTTP routes, production services/repositories and schema
  SQL with PGlite (embedded PostgreSQL), plus tests of the actual frontend transport.
  It verifies tenant isolation, role changes, client assignment, plan count, signup
  rollback, refresh rotation/replay, logout, password change, session organization,
  Origin rejection, MCP guards and API key scopes/revocation.
- PGlite serializes clients. It does NOT prove native PostgreSQL concurrency, connection
  pool behavior, production RLS role configuration or a distributed multi-instance load.
- The first pushed revision passed the dedicated native PostgreSQL 16 suite in GitHub Actions (45 assertions), including concurrent project quota enforcement. It also passed the real golden path: signup, login, project creation, queued crawl, findings/score and credit deduction. Follow-up dependency and validation fixes are rechecked in CI.
- Native PostgreSQL installation was unavailable locally; the native tests were run in CI instead. Browser binary download failed locally. Full browser and Docker acceptance remains unverified until CI completes.

## Commercial acceptance still required

1. Deploy the exact commit to staging with HTTPS and a real PostgreSQL database. Run the
   real browser golden path and native-PG concurrency/tenant/RLS tests in CI. Verify the
   production database role: the shipped compose owner/superuser bypasses RLS. Migration
   004 removes the older permissive and recursive policies; the separate SQL test uses a
   non-owner role. Full API operation under a least-privilege runtime role remains an
   additional deployment requirement, including auth and provider callbacks.
2. Configure the selected SEO/AI providers and test a paid crawl/keyword/ranking/report
   flow with real provider responses and reconciled credit/usage records.
3. Configure a payment account that the operator can actually use; test checkout,
   signed webhook handling, renewal, failed payment, cancellation and refund. The code
   has Stripe support; no live account or live payment was configured in this work.
4. Exercise backup AND restore on staging and establish monitoring, operational access,
   retention and customer support. A backup endpoint alone is not recovery proof.
5. Configure SMTP_URL and MAIL_FROM and test recovery with the real verified sender.
   Account email verification is not implemented. Adding team members currently requires an existing
   registered account; email invitations are not implemented.
6. Review incomplete Agency/white-label/notification UX and advertise only capabilities
   that have passed acceptance. No SSO, MFA or contractual SLA is delivered by this work.
7. Run a customer pilot before collecting subscriptions. Successful builds and embedded
   SQL tests are not a statement that every commercial module works in production.

## Dependency security follow-up

The first CI run exposed vulnerable Vite/source-map-js, body-parser, undici and Zod versions. Compatible patched dependencies were installed; Zod was upgraded to 4.6.7 and validation error handling adapted to issues. CI now audits root, API, Worker and MCP dependencies and installs API dependencies before Stripe unit tests.
