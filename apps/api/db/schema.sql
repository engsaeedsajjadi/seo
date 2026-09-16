-- RankForge Production Database Schema
-- PostgreSQL 15+
-- All tables are tenant-scoped via organization_id

-- ============================================================
-- CORE ENTITIES
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  password_hash TEXT NOT NULL,
  name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);

-- Organizations (Tenants)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(63) UNIQUE NOT NULL,
  plan VARCHAR(20) DEFAULT 'FREE',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- Organization Members
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);

-- ============================================================
-- PROJECTS
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  normalized_domain VARCHAR(255) NOT NULL,
  country VARCHAR(2) DEFAULT 'US',
  language VARCHAR(5) DEFAULT 'en',
  timezone VARCHAR(50) DEFAULT 'UTC',
  device VARCHAR(10) DEFAULT 'both',
  search_engines TEXT[] DEFAULT ARRAY['google'],
  competitors TEXT[] DEFAULT ARRAY[]::TEXT[],
  crawl_max_depth INTEGER DEFAULT 5,
  crawl_max_pages INTEGER DEFAULT 500,
  crawl_concurrency INTEGER DEFAULT 5,
  crawl_user_agent TEXT DEFAULT 'RankForge/1.0',
  crawl_respect_robots BOOLEAN DEFAULT TRUE,
  crawl_render_js BOOLEAN DEFAULT FALSE,
  seo_score INTEGER,
  last_crawl_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(organization_id, normalized_domain)
);

CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_domain ON projects(normalized_domain);

-- ============================================================
-- CRAWL & AUDIT
-- ============================================================

CREATE TABLE IF NOT EXISTS crawls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  pages_crawled INTEGER DEFAULT 0,
  pages_found INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crawls_project ON crawls(project_id);
CREATE INDEX IF NOT EXISTS idx_crawls_org ON crawls(organization_id);

CREATE TABLE IF NOT EXISTS crawl_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  crawl_id UUID NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status_code INTEGER,
  title TEXT,
  meta_description TEXT,
  h1 TEXT,
  word_count INTEGER,
  response_time_ms INTEGER,
  content_type TEXT,
  canonical_url TEXT,
  robots_directive TEXT,
  is_noindex BOOLEAN DEFAULT FALSE,
  is_nofollow BOOLEAN DEFAULT FALSE,
  internal_links INTEGER DEFAULT 0,
  external_links INTEGER DEFAULT 0,
  images_total INTEGER DEFAULT 0,
  images_missing_alt INTEGER DEFAULT 0,
  has_structured_data BOOLEAN DEFAULT FALSE,
  structured_data_types TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crawl_pages_crawl ON crawl_pages(crawl_id);
CREATE INDEX IF NOT EXISTS idx_crawl_pages_org ON crawl_pages(organization_id);

CREATE TABLE IF NOT EXISTS crawl_issues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  crawl_id UUID NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
  page_id UUID REFERENCES crawl_pages(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_id VARCHAR(50) NOT NULL,
  severity VARCHAR(10) NOT NULL,
  category VARCHAR(30) NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  recommendation TEXT,
  evidence JSONB,
  status VARCHAR(10) DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crawl_issues_crawl ON crawl_issues(crawl_id);
CREATE INDEX IF NOT EXISTS idx_crawl_issues_org ON crawl_issues(organization_id);
CREATE INDEX IF NOT EXISTS idx_crawl_issues_severity ON crawl_issues(severity);

-- ============================================================
-- KEYWORDS & RANKINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS keywords (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  term VARCHAR(500) NOT NULL,
  volume INTEGER,
  cpc DECIMAL(10,2),
  difficulty INTEGER,
  intent VARCHAR(20),
  current_position INTEGER,
  previous_position INTEGER,
  best_position INTEGER,
  provider VARCHAR(50),
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_keywords_project ON keywords(project_id);
CREATE INDEX IF NOT EXISTS idx_keywords_org ON keywords(organization_id);

CREATE TABLE IF NOT EXISTS keyword_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword_id UUID NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  position INTEGER,
  url TEXT,
  date DATE NOT NULL,
  engine VARCHAR(20) DEFAULT 'google',
  country VARCHAR(2),
  device VARCHAR(10),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_keyword_snapshots_keyword ON keyword_snapshots(keyword_id);
CREATE INDEX IF NOT EXISTS idx_keyword_snapshots_date ON keyword_snapshots(date);

-- ============================================================
-- COMPETITORS & BACKLINKS
-- ============================================================

CREATE TABLE IF NOT EXISTS competitors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain VARCHAR(255) NOT NULL,
  visibility_score INTEGER,
  shared_keywords INTEGER,
  last_analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitors_project ON competitors(project_id);
CREATE INDEX IF NOT EXISTS idx_competitors_org ON competitors(organization_id);

CREATE TABLE IF NOT EXISTS backlinks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  anchor_text TEXT,
  domain_rating INTEGER,
  is_nofollow BOOLEAN DEFAULT FALSE,
  is_sponsored BOOLEAN DEFAULT FALSE,
  is_ugc BOOLEAN DEFAULT FALSE,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  status VARCHAR(10) DEFAULT 'active',
  provider VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backlinks_project ON backlinks(project_id);
CREATE INDEX IF NOT EXISTS idx_backlinks_org ON backlinks(organization_id);

-- ============================================================
-- INTEGRATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'not_configured',
  credentials_encrypted BYTEA,
  config JSONB DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integrations_org ON integrations(organization_id);

-- GSC Data
CREATE TABLE IF NOT EXISTS gsc_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  ctr DECIMAL(5,4) DEFAULT 0,
  position DECIMAL(5,2) DEFAULT 0,
  query TEXT,
  page TEXT,
  country VARCHAR(2),
  device VARCHAR(10),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gsc_metrics_org ON gsc_metrics(organization_id);
CREATE INDEX IF NOT EXISTS idx_gsc_metrics_date ON gsc_metrics(date);

-- ============================================================
-- AI & CONTENT
-- ============================================================

CREATE TABLE IF NOT EXISTS content_briefs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_keyword TEXT,
  content_type VARCHAR(20),
  target_word_count INTEGER,
  status VARCHAR(20) DEFAULT 'draft',
  outline JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_briefs_project ON content_briefs(project_id);

CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  estimated_cost_usd DECIMAL(10,6),
  operation VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_org ON ai_usage(organization_id);

-- GEO/AEO
CREATE TABLE IF NOT EXISTS geo_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ai_engine VARCHAR(50) NOT NULL,
  prompt TEXT NOT NULL,
  brand_mentioned BOOLEAN DEFAULT FALSE,
  brand_position INTEGER,
  cited_urls TEXT[],
  competitor_mentions JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geo_runs_project ON geo_runs(project_id);

-- ============================================================
-- AUTOMATION & JOBS
-- ============================================================

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  payload JSONB DEFAULT '{}',
  result JSONB,
  error TEXT,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_org ON jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR(10) NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_org ON alerts(organization_id);
CREATE INDEX IF NOT EXISTS idx_alerts_read ON alerts(read);

-- ============================================================
-- REPORTS
-- ============================================================

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  format VARCHAR(10) NOT NULL,
  status VARCHAR(20) DEFAULT 'generating',
  storage_key TEXT,
  download_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reports_org ON reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_reports_project ON reports(project_id);

-- ============================================================
-- BILLING & CREDITS
-- ============================================================

CREATE TABLE IF NOT EXISTS credit_wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  balance INTEGER DEFAULT 0,
  total_granted INTEGER DEFAULT 0,
  total_consumed INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_wallets_org ON credit_wallets(organization_id);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL, -- grant, consumption, refund, expiry
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT,
  reference_type VARCHAR(50),
  reference_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_txns_org ON credit_transactions(organization_id);

CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  metric VARCHAR(50) NOT NULL,
  quantity INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_org ON usage_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_usage_period ON usage_records(period_start, period_end);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'usd',
  status VARCHAR(20) NOT NULL,
  period_start DATE,
  period_end DATE,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id);

-- ============================================================
-- API & WEBHOOKS
-- ============================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix VARCHAR(20) NOT NULL,
  scopes TEXT[] DEFAULT ARRAY['read'],
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  events TEXT[] NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_org ON webhooks(organization_id);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  attempts INTEGER DEFAULT 1,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);

-- ============================================================
-- AUDIT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- ============================================================
-- COMPATIBILITY TABLES (for repository naming consistency)
-- ============================================================

CREATE TABLE IF NOT EXISTS crawl_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending',
  total_pages INTEGER DEFAULT 0,
  crawled_pages INTEGER DEFAULT 0,
  failed_pages INTEGER DEFAULT 0,
  config JSONB DEFAULT '{}',
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crawl_runs_project ON crawl_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_crawl_runs_org ON crawl_runs(organization_id);

CREATE TABLE IF NOT EXISTS audit_findings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  crawl_run_id UUID REFERENCES crawl_runs(id) ON DELETE CASCADE,
  rule_id VARCHAR(50) NOT NULL,
  severity VARCHAR(10) NOT NULL,
  category VARCHAR(30) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  evidence JSONB,
  affected_urls TEXT[],
  recommendation TEXT,
  status VARCHAR(10) DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_findings_project ON audit_findings(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_findings_org ON audit_findings(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_findings_severity ON audit_findings(severity);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawls ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE backlinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsc_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policies — Tenant isolation at database level
-- Supports both user-based and organization-based isolation for testing and production

-- Organizations: visible if user is member OR if organization_id matches current setting
CREATE POLICY org_isolation ON organizations
  FOR ALL TO PUBLIC
  USING (
    id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID
    )
    OR current_setting('app.current_organization_id', true) = ''
    OR current_setting('app.current_organization_id', true) IS NULL
  );

-- Projects: tenant isolation by organization_id
CREATE POLICY project_isolation ON projects
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID
    )
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

-- Additional policies for other tenant tables using organization_id
CREATE POLICY org_members_isolation ON organization_members
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR organization_id IN (
      SELECT organization_id FROM organization_members AS om
      WHERE om.user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID
    )
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY crawl_isolation ON crawls
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY crawl_pages_isolation ON crawl_pages
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY crawl_issues_isolation ON crawl_issues
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY keyword_isolation ON keywords
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY keyword_snapshots_isolation ON keyword_snapshots
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY competitors_isolation ON competitors
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY backlinks_isolation ON backlinks
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY job_isolation ON jobs
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY alerts_isolation ON alerts
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY reports_isolation ON reports
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY integrations_isolation ON integrations
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY credit_wallets_isolation ON credit_wallets
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY credit_transactions_isolation ON credit_transactions
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY api_keys_isolation ON api_keys
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY audit_logs_isolation ON audit_logs
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY usage_records_isolation ON usage_records
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY invoices_isolation ON invoices
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY gsc_metrics_isolation ON gsc_metrics
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY geo_runs_isolation ON geo_runs
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY content_briefs_isolation ON content_briefs
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY ai_usage_isolation ON ai_usage
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY crawl_runs_isolation ON crawl_runs
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );

CREATE POLICY audit_findings_isolation ON audit_findings
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' OR current_setting('app.current_organization_id', true) IS NULL)
       AND (current_setting('app.current_user_id', true) = '' OR current_setting('app.current_user_id', true) IS NULL)
  );
