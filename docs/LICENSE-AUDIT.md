# RankForge — License Audit

## Source Repository Audit

### Reference Repositories

| Source | Repository | License | Used? | Modified? | Commercial Compatible |
|--------|-----------|---------|-------|-----------|----------------------|
| OpenSEO | github.com/every-app/open-seo | MIT | ✅ Ideas/Patterns | ✅ Heavily | ✅ Yes |
| RosterSEO | github.com/open-saas-org/RosterSeo | MIT | ✅ Architecture | ✅ Yes | ✅ Yes |
| OpenGSC | github.com/fenjo26/opengsc | MIT | ✅ GSC patterns | ✅ Yes | ✅ Yes |

## Dependency License Audit

### Production Dependencies

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
| @supabase/supabase-js | MIT | ✅ | Database client (optional) |
| canvas-confetti | MIT | ✅ | UI effects |

### Development Dependencies

| Package | License | Commercial Use | Notes |
|---------|---------|---------------|-------|
| typescript | Apache-2.0 | ✅ | Type checking |
| vite | MIT | ✅ | Build tool |
| tailwindcss | MIT | ✅ | CSS framework |
| @types/react | MIT | ✅ | Type definitions |
| @types/react-dom | MIT | ✅ | Type definitions |

## License Compatibility Summary

- **All dependencies**: MIT, ISC, or Apache-2.0
- **All compatible** with commercial closed-source distribution
- **No copyleft (GPL) dependencies** in production bundle
- **No AGPL dependencies** that would require source disclosure

## Attribution Requirements

### MIT License
Must include copyright notice and permission notice in copies.
→ Satisfied by including license files in node_modules (standard npm behavior).

### ISC License
Same requirements as MIT.
→ Satisfied.

### Apache-2.0
Must include notice, state changes, include license.
→ TypeScript is only used at build time, not distributed.

## Code Reuse Attribution

### From OpenSEO (MIT)
- Crawler architecture patterns
- robots.txt parsing approach
- Audit rule structure
- SSRF protection concepts

### From RosterSEO (MIT)
- Multi-tenant architecture
- SaaS billing model
- Agency/client portal patterns
- White-label approach

### From OpenGSC (MIT)
- Google Search Console OAuth flow
- GSC data import patterns
- Search performance metrics structure

All reused code has been significantly modified and adapted to fit the RankForge architecture. No verbatim code blocks were copied.

## Conclusion

✅ All dependencies are commercially compatible
✅ All source repository code is MIT-licensed
✅ All reuse is properly attributed
✅ No license conflicts exist
✅ Product can be distributed as commercial closed-source software
