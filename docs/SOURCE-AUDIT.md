# Source Repository Audit — RankForge

**Date:** 2026-09-16
**Auditor:** Principal Architect
**Purpose:** Inspect reference repositories and extract reusable patterns without blindly merging.

## Reference Repositories

### 1. Primary SEO Engine — every-app/open-seo (MIT)

**Repository:** https://github.com/every-app/open-seo
**License:** MIT — Commercial Compatible ✅
**Stars:** ~18.9k
**Tech:** TanStack Start / Next.js, PostgreSQL, Drizzle, BullMQ, DataForSEO

**Key Modules Inspected:**
| Path | Function | Reusable? | Risk | Target |
|------|----------|-----------|------|--------|
| `src/lib/crawler/` | HTTP crawler with robots.txt, sitemap, SSRF protection | ✅ Yes | Low | `packages/crawler` |
| `src/lib/audit/rules/` | Modular SEO audit rules (title, meta, headings, etc) | ✅ Yes | Low | `packages/audit` |
| `src/lib/dataforseo/` | DataForSEO provider abstraction (keywords, SERP, backlinks) | ✅ Yes | Medium (API cost) | `packages/seo` |
| `src/lib/scoring/` | SEO score calculation from findings | ✅ Yes | Low | `packages/audit/scoring.ts` |
| `src/lib/ssrf/` | SSRF protection with IP blocklist, DNS validation | ✅ Yes | Low | `packages/security/ssrf.ts` |
| `src/lib/keywords/clustering.ts` | Keyword clustering by intent/semantic | ✅ Yes | Low | `packages/keywords` |
| `drizzle/` | Database schema with multi-tenancy | ✅ Yes | Low | `packages/db/schema` |
| `src/routes/api/` | Route handlers with Zod validation | ✅ Yes | Low | `apps/api/src/routes` |
| `e2e/` | E2E testing strategy | ✅ Pattern | Low | `docs/TESTING.md` |

**Architecture Patterns Extracted:**
- Modular rule engine: each rule is a separate file with id, severity, category, check function
- Provider interface: SearchProvider with DataForSEO implementation
- Job queue with pg-boss / BullMQ
- Tenant isolation via organization_id in all tables
- Zod validation on all inputs

**License Audit:**
- MIT — Allows commercial use, modification, distribution
- No copyleft dependencies
- Attribution required: include MIT license notice — satisfied

**Rejected:**
- UI components tightly coupled to their design system — we use our own shadcn-style system
- Their auth (Clerk) — we use Better Auth / JWT self-hostable for independence

---

### 2. Primary SaaS Architecture — open-saas-org/RosterSeo (MIT)

**Repository:** https://github.com/open-saas-org/RosterSeo
**License:** MIT — Commercial Compatible ✅
**Tech:** Next.js, PostgreSQL, Prisma, Better Auth, Docker

**Key Modules Inspected:**
| Path | Function | Reusable? | Risk | Target |
|------|----------|-----------|------|--------|
| `apps/web/` | Next.js app router with multi-tenancy | ✅ Pattern | Low | `apps/web` structure |
| `packages/db/` | Prisma schema with Organization, Member, Project | ✅ Yes | Low | `packages/db` |
| `packages/auth/` | Better Auth integration, OAuth, 2FA, session | ✅ Yes | Low | `packages/auth` |
| `packages/billing/` | Stripe plans, subscriptions, webhooks | ✅ Yes | Low | `packages/billing` |
| `packages/crawler/` | Crawler with concurrency, JS rendering fallback | ✅ Yes | Medium | `packages/crawler` |
| `packages/ai/` | AI provider abstraction (OpenAI, Anthropic, etc) | ✅ Yes | Low | `packages/ai` |
| `apps/worker/` | Background worker with pg-boss | ✅ Yes | Low | `apps/worker` |
| `packages/geo/` | AI visibility tracking | ✅ Yes | Medium | `packages/geo` |
| `packages/aeo/` | Answer Engine Optimization | ✅ Yes | Medium | `packages/aeo` |
| `docker/` | Docker Compose with web, worker, postgres | ✅ Yes | Low | `docker/` |

**Architecture Patterns Extracted:**
- Monorepo with `apps/` and `packages/` — adopted
- Organization → Project → Website hierarchy
- RBAC with 8 roles, granular permissions
- Credit system: wallet, transactions, consumption
- Usage metering per operation
- Agency mode: client isolation
- White-label: custom logo, colors, domain
- Client portal: restricted view
- API keys with scopes, expiration, revocation
- Webhooks with HMAC signing
- MCP server with tool definitions

**License Audit:**
- MIT — Commercial compatible
- No GPL dependencies
- Safe to reuse patterns and adapt code

---

### 3. Additional Reference — fenjo26/opengsc (MIT)

**Repository:** https://github.com/fenjo26/opengsc
**License:** MIT — Commercial Compatible ✅
**Tech:** Next.js 16, Prisma, SQLite, NextAuth, GSC API

**Key Modules Inspected:**
| Path | Function | Reusable? | Risk | Target |
|------|----------|-----------|------|--------|
| `src/lib/gsc/` | GSC OAuth, metrics import, opportunity detection | ✅ Yes | Low | `packages/gsc` |
| `src/lib/ga4/` | GA4 OAuth, traffic correlation | ✅ Yes | Low | `packages/ga4` |
| `src/lib/pagespeed/` | PageSpeed Insights integration, CWV history | ✅ Yes | Low | `packages/pagespeed` |
| `src/lib/serpmon/` | SERP monitoring, rank tracking | ✅ Yes | Medium | `packages/serp` |
| `src/lib/mcp/` | MCP server with 46 tools | ✅ Yes | Low | `apps/mcp` |
| `src/lib/seo-tools/` | Content briefs, outlines, optimization | ✅ Yes | Low | `packages/content` |
| `prisma/schema.prisma` | SQLite schema — simple but lacks RLS | ⚠️ Pattern only | Low | Reference for GSC tables |

**Architecture Patterns Extracted:**
- GSC OAuth flow: consent, token storage encrypted, refresh
- Metrics: clicks, impressions, CTR, position with striking distance detection
- GA4 correlation with SEO data
- PageSpeed historical snapshots
- MCP tool definitions with tenant isolation
- Content engine with AI briefs

**License Audit:**
- MIT — Commercial compatible
- Safe to adapt GSC/GA4 patterns

---

## Combined Reuse Matrix

| Component | Source | Original Path | License | Used? | Modified? | Commercial Compat | Attribution |
|-----------|--------|---------------|---------|-------|-----------|-------------------|-------------|
| Crawler core | OpenSEO | `src/lib/crawler/` | MIT | ✅ | ✅ Heavily | ✅ | MIT notice preserved |
| SSRF protection | OpenSEO | `src/lib/ssrf/` | MIT | ✅ | ✅ Enhanced | ✅ | MIT |
| Audit rule engine | OpenSEO | `src/lib/audit/rules/` | MIT | ✅ | ✅ Extended | ✅ | MIT |
| SEO scoring | OpenSEO | `src/lib/scoring/` | MIT | ✅ | ✅ Rewritten | ✅ | MIT |
| DataForSEO provider | OpenSEO | `src/lib/dataforseo/` | MIT | ✅ | ✅ Abstraction added | ✅ | MIT |
| Multi-tenancy | RosterSeo | `packages/db/` | MIT | ✅ | ✅ RLS added | ✅ | MIT |
| Billing | RosterSeo | `packages/billing/` | MIT | ✅ | ✅ Credits added | ✅ | MIT |
| Auth | RosterSeo | `packages/auth/` | MIT | ✅ | ✅ JWT + Better Auth pattern | ✅ | MIT |
| Worker | RosterSeo | `apps/worker/` | MIT | ✅ | ✅ pg-boss adaptation | ✅ | MIT |
| AI provider | RosterSeo | `packages/ai/` | MIT | ✅ | ✅ Metering added | ✅ | MIT |
| GEO/AEO | RosterSeo | `packages/geo/`, `packages/aeo/` | MIT | ✅ | ✅ Extended | ✅ | MIT |
| GSC integration | OpenGSC | `src/lib/gsc/` | MIT | ✅ | ✅ OAuth + encryption | ✅ | MIT |
| GA4 integration | OpenGSC | `src/lib/ga4/` | MIT | ✅ | ✅ | ✅ | MIT |
| PageSpeed | OpenGSC | `src/lib/pagespeed/` | MIT | ✅ | ✅ History | ✅ | MIT |
| MCP server | OpenGSC | `src/lib/mcp/` | MIT | ✅ | ✅ Tenant-isolated | ✅ | MIT |
| Content engine | OpenGSC | `src/lib/seo-tools/` | MIT | ✅ | ✅ AI abstraction | ✅ | MIT |

**Total Reused:** 16 components, all MIT, all commercial compatible.

## Risk Assessment

- **No GPL/AGPL** dependencies found in any source — safe
- **No proprietary** code copied verbatim — all adapted to RankForge architecture
- **No secret** leakage from sources — all use env vars
- **Provider abstraction** ensures we are not locked to DataForSEO — future providers can be added

## Conclusion

All three repositories are MIT-licensed and suitable as architectural references and for selective code reuse. We have extracted patterns, not copied entire applications. Final product has its own:

- Product identity (RankForge)
- Database schema (PostgreSQL + Drizzle + RLS)
- Billing model (Stripe + credits + 5 plans)
- Tenant model (Organization → Project with RLS)
- Security model (SSRF, tenant isolation, encryption)
- UI (React + Tailwind, not copied)
- API (Express + Zod, versioned)
- Documentation (own)
- Tests (own)
- Deployment (Docker + CI/CD)

**License Audit File:** `docs/LICENSE-AUDIT.md` — updated with this matrix.
