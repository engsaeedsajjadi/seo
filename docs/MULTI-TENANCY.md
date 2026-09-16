# RankForge — Multi-Tenancy Documentation

## Overview
Mandatory multi-tenant architecture with isolation at application and database levels.

## Model

```
User
└── Organization (tenant)
    ├── Members (with roles)
    ├── Subscription & Credits
    ├── Projects (websites)
    │   ├── Keywords
    │   ├── Rankings
    │   ├── Audit Findings
    │   ├── Crawl Runs & Pages
    │   ├── Backlinks
    │   ├── Competitors
    │   ├── Reports
    │   └── Integrations
    ├── Clients (agency mode)
    ├── API Keys
    ├── Webhooks
    └── White-Label Config
```

## Tenant Isolation

### Application Level
- Every API endpoint resolves organization_id from authenticated JWT session
- Never trust client-provided organizationId, projectId, userId for authorization
- Middleware: authMiddleware extracts userId, organizationId from token
- Ownership check: `project.organizationId === req.organizationId`
- All queries scoped: `WHERE organization_id = $1`

### Database Level
- PostgreSQL Row Level Security (RLS) enabled on all tenant-scoped tables
- Policies enforce organization isolation
- Example:
```sql
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_isolation ON projects
  USING (organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = current_setting('app.current_user_id')::UUID
  ));
```
- Similar for: organizations, organization_members, crawl_runs, crawl_pages, audit_findings, keywords, rankings, competitors, backlinks, jobs, alerts, reports, integrations, credit_wallets, credit_transactions, api_keys, audit_logs, clients, etc.

### API Level
- API keys scoped to organization
- Webhooks scoped to organization
- MCP tools require organizationId and enforce isolation

### Storage Level
- S3 keys prefixed with organization_id
- Reports, exports stored under org-specific path
- No cross-org access

## RBAC

Roles (8):
- Owner (100) — full access, billing manage
- Admin (80) — manage org, billing read, team invite
- Manager (60) — manage projects, team invite, reports
- SEO_Manager (50) — SEO operations, audit run, keyword write
- Analyst (40) — read + reports, audit read, rank read
- Editor (30) — content + keyword write, project read
- Client (20) — restricted portal, read-only
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

## Testing Tenant Isolation

Automated tests verify:
- User A cannot read User B data → 403
- User A cannot modify User B data → 403
- User A cannot delete User B data → 403
- User A cannot access User B reports → 403
- User A cannot use User B API key → 403
- User A cannot access User B storage → 403
- User A cannot access User B jobs → 403
- User A cannot access User B billing → 403
- Cross-tenant via API key → 403
- Cross-tenant via direct ID → 403

## White-Label Isolation

- White-label config per organization (logo, colors, company name, favicon, email sender, report branding, custom domain, login branding)
- Config stored in organizations.white_label jsonb
- Never leaks between organizations — checked in tests
- Client portal uses org's white-label

## Agency Mode

- Organization can create Clients (isolated)
- Each client has isolated projects via client_projects join table
- Agency can manage clients, invite users, assign projects, generate reports, schedule reports, use white-label, manage billing
- Client sees only assigned projects
- Client role restricted

## Security

- No secret leakage between tenants
- Audit logs per organization
- Usage metering per organization
- Credit wallets per organization
- API keys per organization
- Webhooks per organization

## Implementation

- JWT contains organizationId
- Middleware extracts and validates
- All DB queries include organization_id filter
- RLS as defense-in-depth
- Tests for isolation in CI
