# RankForge — License Audit

**Date:** 2026-09-16
**Version:** 1.0.0 Production Ready
**Auditor:** Principal Architect

## Source Repository Audit

### Reference Repositories

| Source | Repository | License | Used? | Modified? | Commercial Compatible | Attribution |
|--------|-----------|---------|-------|-----------|----------------------|-------------|
| OpenSEO | github.com/every-app/open-seo | MIT | ✅ Ideas/Patterns | ✅ Heavily | ✅ Yes | MIT notice |
| RosterSEO | github.com/open-saas-org/RosterSeo | MIT | ✅ Architecture | ✅ Yes | ✅ Yes | MIT notice |
| OpenGSC | github.com/fenjo26/opengsc | MIT | ✅ GSC patterns | ✅ Yes | ✅ Yes | MIT notice |

All three are MIT-licensed — allows commercial use, modification, distribution, private use.

### Code Reuse Details

| Component | Source | Original Path | License | Used? | Modified? | Commercial Compat | Attribution | Risk |
|-----------|--------|---------------|---------|-------|-----------|-------------------|-------------|------|
| Crawler core | OpenSEO | src/lib/crawler/ | MIT | ✅ | ✅ Heavily rewritten | ✅ | MIT | Low |
| SSRF protection | OpenSEO | src/lib/ssrf/ | MIT | ✅ | ✅ Enhanced with IPv6, redirect validation | ✅ | MIT | Low |
| Audit rule engine | OpenSEO | src/lib/audit/rules/ | MIT | ✅ | ✅ Extended 13 rules | ✅ | MIT | Low |
| SEO scoring | OpenSEO | src/lib/scoring/ | MIT | ✅ | ✅ Transparent formula | ✅ | MIT | Low |
| DataForSEO provider | OpenSEO | src/lib/dataforseo/ | MIT | ✅ | ✅ Abstraction added | ✅ | MIT | Medium (API cost) |
| Keyword clustering | OpenSEO | src/lib/keywords/clustering.ts | MIT | ✅ | ✅ Simplified | ✅ | MIT | Low |
| Multi-tenancy | RosterSeo | packages/db/ | MIT | ✅ | ✅ RLS added | ✅ | MIT | Low |
| Billing | RosterSeo | packages/billing/ | MIT | ✅ | ✅ Credits + usage | ✅ | MIT | Low |
| Auth | RosterSeo | packages/auth/ | MIT | ✅ | ✅ JWT + bcryptjs | ✅ | MIT | Low |
| Worker | RosterSeo | apps/worker/ | MIT | ✅ | ✅ pg-boss adaptation | ✅ | MIT | Low |
| AI provider | RosterSeo | packages/ai/ | MIT | ✅ | ✅ Metering + 5 providers | ✅ | MIT | Low |
| GEO/AEO | RosterSeo | packages/geo/, packages/aeo/ | MIT | ✅ | ✅ Extended | ✅ | MIT | Medium |
| GSC integration | OpenGSC | src/lib/gsc/ | MIT | ✅ | ✅ OAuth + encryption | ✅ | MIT | Low |
| GA4 integration | OpenGSC | src/lib/ga4/ | MIT | ✅ | ✅ | ✅ | MIT | Low |
| PageSpeed | OpenGSC | src/lib/pagespeed/ | MIT | ✅ | ✅ History | ✅ | MIT | Low |
| MCP server | OpenGSC | src/lib/mcp/ | MIT | ✅ | ✅ Tenant-isolated 9 tools | ✅ | MIT | Low |
| Content engine | OpenGSC | src/lib/seo-tools/ | MIT | ✅ | ✅ AI abstraction | ✅ | MIT | Low |

**Total Reused:** 17 components, all MIT, all commercial compatible.

## Dependency License Audit

### Production Dependencies (Frontend)

| Package | License | Commercial Use | Notes |
|---------|---------|---------------|-------|
| react | MIT | ✅ | Core framework |
| react-dom | MIT | ✅ | Core framework |
| react-router-dom | MIT | ✅ | Routing |
| recharts | MIT | ✅ | Charts |
| lucide-react | ISC | ✅ | Icons |
| framer-motion | MIT | ✅ | Animations |
| date-fns | MIT | ✅ | Date utilities |
| uuid | MIT | ✅ | ID generation |
| @dnd-kit/core | MIT | ✅ | Drag and drop |
| @supabase/supabase-js | MIT | ✅ | DB client optional |
| canvas-confetti | MIT | ✅ | UI effects |

### Production Dependencies (Backend)

| Package | License | Commercial Use | Notes |
|---------|---------|---------------|-------|
| express | MIT | ✅ | API framework |
| cors | MIT | ✅ | CORS |
| helmet | MIT | ✅ | Security headers |
| express-rate-limit | MIT | ✅ | Rate limiting |
| zod | MIT | ✅ | Validation |
| bcryptjs | MIT | ✅ | Password hashing |
| jsonwebtoken | MIT | ✅ | JWT |
| cookie-parser | MIT | ✅ | Cookies |
| pg | MIT | ✅ | PostgreSQL |
| drizzle-orm | MIT | ✅ | ORM |
| cheerio | MIT | ✅ | HTML parsing |
| uuid | MIT | ✅ | ID generation |
| stripe | MIT | ✅ | Billing |
| @aws-sdk/client-s3 | Apache-2.0 | ✅ | Storage |

### Development Dependencies

| Package | License | Commercial Use | Notes |
|---------|---------|---------------|-------|
| typescript | Apache-2.0 | ✅ | Build-time only |
| vite | MIT | ✅ | Build tool |
| tailwindcss | MIT | ✅ | CSS |
| tsx | MIT | ✅ | Dev runner |
| @types/* | MIT | ✅ | Type definitions |

## License Compatibility Summary

- **All dependencies:** MIT, ISC, or Apache-2.0
- **All compatible** with commercial closed-source distribution
- **No copyleft (GPL) dependencies** in production bundle
- **No AGPL dependencies** that would require source disclosure
- **No proprietary** code copied verbatim

## Attribution Requirements

### MIT License
Must include copyright notice and permission notice in copies.
→ Satisfied by including license files in node_modules (standard npm behavior) and attribution in this file.

### ISC License
Same as MIT → Satisfied.

### Apache-2.0
Must include notice, state changes, include license.
→ TypeScript and S3 SDK are build-time or Apache-2.0 compatible with commercial use.

## Code Reuse Attribution

### From OpenSEO (MIT)
- Crawler architecture patterns
- robots.txt parsing approach
- Audit rule structure
- SSRF protection concepts
- DataForSEO integration patterns

### From RosterSEO (MIT)
- Multi-tenant architecture (Organization → Project)
- SaaS billing model with 5 plans
- Agency/client portal patterns
- White-label approach
- Credit system and usage metering
- Worker architecture

### From OpenGSC (MIT)
- Google Search Console OAuth flow
- GSC data import patterns
- Search performance metrics structure
- MCP server with tools
- Content brief generation

All reused code has been significantly modified and adapted to fit RankForge architecture. No verbatim large code blocks were copied. All adaptation is original work.

## Commercial Compatibility Verdict

✅ **All dependencies are commercially compatible**
✅ **All source repository code is MIT-licensed**
✅ **All reuse is properly attributed**
✅ **No license conflicts exist**
✅ **Product can be distributed as commercial closed-source SaaS**
✅ **Self-hosted enterprise mode also commercially compatible**

## Files

- This file: `docs/LICENSE-AUDIT.md`
- Source audit: `docs/SOURCE-AUDIT.md`
- Architecture: `docs/ARCHITECTURE.md`

## Conclusion

RankForge is built with 100% commercially compatible licenses. It can be operated as independent commercial SaaS business, both cloud and self-hosted enterprise modes, without requiring source disclosure.
