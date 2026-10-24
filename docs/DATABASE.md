# RankForge — Database Documentation

## Overview
PostgreSQL 16 + Drizzle ORM (with raw pg fallback for simplicity in monolith)
Normalized relational schema with foreign keys, indexes, unique constraints, RLS.

## Entities

### Auth & Multi-Tenancy
- **users:** id, email (unique), name, password_hash, email_verified, avatar_url, 2FA fields, timestamps, deleted_at
- **organizations:** id, name, slug (unique), owner_id → users, plan, stripe_customer_id, subscription_status, settings (jsonb), white_label (jsonb)
- **organization_members:** id, organization_id → orgs, user_id → users, role, permissions (jsonb), unique(org_id, user_id)
- **sessions:** id, user_id → users, token (unique), expires_at, ip, user_agent, revoked_at

### Projects
- **projects:** id, organization_id → orgs, name, domain, normalized_domain, country, language, timezone, search_engines (jsonb), device, competitors (jsonb), target_keywords (jsonb), crawl_config (jsonb), notification_rules (jsonb), integrations (jsonb), seo_score, last_crawl_at, verified_at, timestamps, deleted_at
  - Unique(org_id, normalized_domain)
  - Indexes: org, domain

### Crawler & Audit
- **crawl_runs:** id, org_id, project_id, status, started_at, completed_at, total_pages, crawled_pages, failed_pages, config (jsonb), error
- **crawl_pages:** id, crawl_run_id, org_id, project_id, url, normalized_url, status_code, content_type, title, meta_description, h1, h2 array, word_count, response_time, is_indexable, canonical, robots_meta, hreflang (jsonb), structured_data (jsonb), images (jsonb), links (jsonb), headers (jsonb)
- **audit_rules:** id (PK string), name, description, category, severity, documentation_url, enabled
- **audit_findings:** id, org_id, project_id, crawl_run_id, rule_id → audit_rules, severity, category, title, description, evidence (jsonb), affected_urls array, recommendation, status, timestamps

### Keywords & SERP & Rankings
- **keyword_groups:** id, org_id, project_id, name, description
- **keywords:** id, org_id, project_id, group_id, keyword, normalized_keyword, country, language, search_volume, cpc, competition, difficulty, intent, serp_features (jsonb), trend (jsonb), provider, provider_data (jsonb), last_checked_at, timestamps
  - Unique(org_id, project_id, normalized_keyword, country, language)
- **serp_results:** id, org_id, keyword_id, project_id, query, engine, country, language, device, results (jsonb), serp_features (jsonb), provider, provider_request_id, created_at
- **keyword_rankings:** id, org_id, project_id, keyword_id, position, previous_position, url, search_engine, country, language, device, serp_features (jsonb), date, created_at
  - Indexes: org, project, keyword, date, keyword+date

### Competitors & Backlinks
- **competitors:** id, org_id, project_id, domain, normalized_domain, is_auto_discovered, visibility, keywords_overlap, timestamps
- **backlinks:** id, org_id, project_id, source_domain, source_url, target_url, anchor_text, first_seen, last_seen, lost_at, is_new, is_lost, domain_rating, page_rating, provider, provider_data (jsonb)

### Google Integrations
- **gsc_connections:** id, org_id, project_id, access_token_encrypted, refresh_token_encrypted, expires_at, site_url, connected_at, last_sync_at
- **gsc_metrics:** id, org_id, project_id, date, clicks, impressions, ctr, position, query, page, country, device, search_appearance
- **ga4_connections:** id, org_id, project_id, access_token_encrypted, refresh_token_encrypted, expires_at, property_id, connected_at, last_sync_at
- **ga4_metrics:** id, org_id, project_id, date, users, sessions, organic_users, organic_sessions, landing_page, conversions, revenue
- **pagespeed_results:** id, org_id, project_id, url, device, performance_score, accessibility_score, best_practices_score, seo_score, lcp, inp, cls, fcp, ttfb, raw_result (jsonb)

### Content & AI & GEO/AEO
- **content_items:** id, org_id, project_id, title, target_keyword, content_type, target_word_count, status, outline (jsonb), brief (jsonb), content, seo_score, timestamps
- **ai_runs:** id, org_id, project_id, provider, model, operation, prompt, response, input_tokens, output_tokens, estimated_cost_usd, latency_ms, status, error, created_at
- **geo_runs:** id, org_id, project_id, ai_engine, prompt, answer, brand_mentioned, brand_position, cited_urls array, competitor_mentions (jsonb), visibility_score, sentiment

### Automation & Jobs
- **jobs:** id, org_id, project_id, type, status, payload (jsonb), result (jsonb), error, attempts, max_attempts, scheduled_at, started_at, completed_at, created_at
- **job_attempts:** id, job_id → jobs, attempt_number, status, error, started_at, completed_at

### Alerts & Notifications
- **notification_rules:** id, org_id, project_id, name, condition (jsonb), channels (jsonb), enabled, timestamps
- **alerts:** id, org_id, project_id, rule_id, type, severity, title, message, data (jsonb), read, triggered_at, created_at

### Reports
- **reports:** id, org_id, project_id, type, title, format, status, storage_key, download_url, share_token, share_expires_at, created_at, completed_at
- **report_schedules:** id, org_id, project_id, report_type, format, cron, timezone, recipients (jsonb), enabled, last_run_at, next_run_at

### Billing & Credits
- **plans:** id (FREE, STARTER, PRO, AGENCY, ENTERPRISE), name, description, price_monthly_cents, price_annual_cents, limits (jsonb), features (jsonb), is_active
- **subscriptions:** id, org_id (unique), plan_id → plans, stripe_subscription_id, stripe_price_id, status, current_period_start/end, cancel_at_period_end, trial_start/end, timestamps
- **credit_wallets:** id, org_id (unique), balance, total_granted, total_consumed, updated_at
- **credit_transactions:** id, org_id, type (grant, consumption, refund, expiry), amount, balance_after, description, reference_type, reference_id, created_at
- **usage_records:** id, org_id, project_id, metric, quantity, provider, cost_cents, period_start/end, created_at
- **invoices:** id, org_id, stripe_invoice_id, amount_cents, currency, status, period_start/end, pdf_url, created_at, paid_at

### API & Webhooks & Integrations
- **api_keys:** id, org_id, name, key_hash, key_prefix, scopes array, last_used_at, expires_at, revoked_at, created_at
- **webhooks:** id, org_id, url, secret_hash, events array, active, created_at
- **webhook_deliveries:** id, webhook_id → webhooks, event, payload (jsonb), response_status, response_body, attempts, delivered_at, created_at
- **integrations:** id, org_id, provider, status, credentials_encrypted, settings (jsonb), last_checked_at, timestamps
  - Unique(org_id, provider)

### Agency & Client Portal
- **clients:** id, org_id, name, email, logo_url, settings (jsonb), white_label (jsonb), timestamps
- **client_projects:** id, client_id → clients, project_id → projects, unique(client_id, project_id)

### Audit Logs & Feature Flags
- **audit_logs:** id, org_id, user_id → users, action, resource_type, resource_id, details (jsonb), ip_address, user_agent, created_at
- **feature_flags:** id, key (unique), name, description, enabled, organization_overrides (jsonb), timestamps

## Indexes

Based on real query patterns:
- All foreign keys indexed
- All organization_id indexed
- Project domain indexed
- Keyword normalized_keyword indexed
- Rankings keyword+date composite
- GSC/GA4 date indexed
- Jobs status+type indexed
- Alerts read indexed
- Credit transactions org indexed
- Usage period composite

## RLS Policies

Enabled on all tenant-scoped tables. Example:

```sql
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_isolation ON projects
  USING (organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = current_setting('app.current_user_id')::UUID
  ));
```

Similar for: organizations, organization_members, crawls, crawl_pages, crawl_issues, keywords, competitors, backlinks, jobs, alerts, reports, integrations, credit_wallets, credit_transactions, api_keys, audit_logs, etc.

## Migrations

- Forward-only migrations
- Never modify already-applied migration
- Test against fresh DB and existing DB
- Production migration explicit and safe
- Files: `apps/api/db/schema.sql` (initial), Drizzle migrations in `drizzle/` folder

## Backup & Restore

- Database backup: pg_dump daily, retained 30 days
- Storage backup: S3 versioning
- Disaster recovery: documented in DEPLOYMENT.md
- Restore tested quarterly

## Multi-Tenancy Safety

Every tenant-scoped table has reliable ownership path:
- Direct organization_id, or
- Via project → organization_id, or
- Via organization_members

Tests verify cross-tenant isolation for all operations.
