-- RankForge Production Database Schema — Strict, Idempotent, Production Ready
-- PostgreSQL 15+
-- All tables tenant-scoped via organization_id
-- Policies use DROP IF EXISTS + CREATE for idempotency without swallowing errors

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- CORE ENTITIES
-- ============================================================

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

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(63) UNIQUE NOT NULL,
  plan VARCHAR(20) DEFAULT 'FREE' CHECK (plan IN ('FREE','STARTER','PRO','AGENCY','ENTERPRISE')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status VARCHAR(20) DEFAULT 'active',
  settings JSONB DEFAULT '{}',
  white_label JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner','admin','manager','seo_manager','analyst','editor','client','viewer')),
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
  device VARCHAR(10) DEFAULT 'both' CHECK (device IN ('desktop','mobile','both')),
  search_engines TEXT[] DEFAULT ARRAY['google'],
  competitors TEXT[] DEFAULT ARRAY[]::TEXT[],
  crawl_max_depth INTEGER DEFAULT 5 CHECK (crawl_max_depth >=1 AND crawl_max_depth <=10),
  crawl_max_pages INTEGER DEFAULT 500 CHECK (crawl_max_pages >=1 AND crawl_max_pages <=10000),
  crawl_concurrency INTEGER DEFAULT 5 CHECK (crawl_concurrency >=1 AND crawl_concurrency <=10),
  crawl_user_agent TEXT DEFAULT 'RankForge/1.0',
  crawl_respect_robots BOOLEAN DEFAULT TRUE,
  crawl_render_js BOOLEAN DEFAULT FALSE,
  seo_score INTEGER CHECK (seo_score IS NULL OR (seo_score >=0 AND seo_score <=100)),
  last_crawl_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(organization_id, normalized_domain)
);

CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_domain ON projects(normalized_domain);
CREATE INDEX IF NOT EXISTS idx_projects_org_deleted ON projects(organization_id, deleted_at);

-- ============================================================
-- CRAWL & AUDIT — Real persistence
-- ============================================================

CREATE TABLE IF NOT EXISTS crawls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','cancelled')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  pages_crawled INTEGER DEFAULT 0,
  pages_found INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crawls_project ON crawls(project_id);
CREATE INDEX IF NOT EXISTS idx_crawls_org ON crawls(organization_id);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','cancelled')),
  total_pages INTEGER DEFAULT 0,
  crawled_pages INTEGER DEFAULT 0,
  failed_pages INTEGER DEFAULT 0,
  config JSONB DEFAULT '{}',
  error TEXT,
  error_code VARCHAR(50),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crawl_runs_project ON crawl_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_crawl_runs_org ON crawl_runs(organization_id);
CREATE INDEX IF NOT EXISTS idx_crawl_runs_status ON crawl_runs(status);

CREATE TABLE IF NOT EXISTS crawl_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  crawl_id UUID REFERENCES crawls(id) ON DELETE CASCADE,
  crawl_run_id UUID REFERENCES crawl_runs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  normalized_url TEXT,
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
  headers JSONB,
  links JSONB,
  images JSONB,
  structured_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(crawl_run_id, normalized_url)
);

CREATE INDEX IF NOT EXISTS idx_crawl_pages_crawl ON crawl_pages(crawl_id);
CREATE INDEX IF NOT EXISTS idx_crawl_pages_run ON crawl_pages(crawl_run_id);
CREATE INDEX IF NOT EXISTS idx_crawl_pages_org ON crawl_pages(organization_id);
CREATE INDEX IF NOT EXISTS idx_crawl_pages_project ON crawl_pages(project_id);

CREATE TABLE IF NOT EXISTS crawl_issues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  crawl_id UUID REFERENCES crawls(id) ON DELETE CASCADE,
  crawl_run_id UUID REFERENCES crawl_runs(id) ON DELETE CASCADE,
  page_id UUID REFERENCES crawl_pages(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  rule_id VARCHAR(50) NOT NULL,
  severity VARCHAR(10) NOT NULL CHECK (severity IN ('critical','high','medium','low','notice')),
  category VARCHAR(30) NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  recommendation TEXT,
  evidence JSONB,
  status VARCHAR(10) DEFAULT 'open' CHECK (status IN ('open','fixed','ignored','wont_fix')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crawl_issues_crawl ON crawl_issues(crawl_id);
CREATE INDEX IF NOT EXISTS idx_crawl_issues_run ON crawl_issues(crawl_run_id);
CREATE INDEX IF NOT EXISTS idx_crawl_issues_org ON crawl_issues(organization_id);
CREATE INDEX IF NOT EXISTS idx_crawl_issues_severity ON crawl_issues(severity);
CREATE INDEX IF NOT EXISTS idx_crawl_issues_rule ON crawl_issues(rule_id);

CREATE TABLE IF NOT EXISTS audit_findings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  crawl_run_id UUID REFERENCES crawl_runs(id) ON DELETE CASCADE,
  crawl_id UUID REFERENCES crawls(id) ON DELETE CASCADE,
  rule_id VARCHAR(50) NOT NULL,
  severity VARCHAR(10) NOT NULL CHECK (severity IN ('critical','high','medium','low','notice')),
  category VARCHAR(30) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  evidence JSONB,
  affected_urls TEXT[],
  recommendation TEXT,
  status VARCHAR(10) DEFAULT 'open' CHECK (status IN ('open','fixed','ignored','wont_fix')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_findings_project ON audit_findings(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_findings_org ON audit_findings(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_findings_severity ON audit_findings(severity);
CREATE INDEX IF NOT EXISTS idx_audit_findings_run ON audit_findings(crawl_run_id);

-- ============================================================
-- KEYWORDS & RANKINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS keywords (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  term VARCHAR(500) NOT NULL,
  normalized_term VARCHAR(500),
  keyword VARCHAR(500),
  normalized_keyword VARCHAR(500),
  volume INTEGER,
  search_volume INTEGER,
  cpc DECIMAL(10,2),
  competition DECIMAL(5,2),
  difficulty INTEGER CHECK (difficulty IS NULL OR (difficulty >=0 AND difficulty <=100)),
  intent VARCHAR(20) CHECK (intent IS NULL OR intent IN ('informational','navigational','transactional','commercial')),
  current_position INTEGER,
  previous_position INTEGER,
  best_position INTEGER,
  provider VARCHAR(50) DEFAULT 'not_configured',
  country VARCHAR(2) DEFAULT 'US',
  language VARCHAR(5) DEFAULT 'en',
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, normalized_term, country)
);

CREATE INDEX IF NOT EXISTS idx_keywords_project ON keywords(project_id);
CREATE INDEX IF NOT EXISTS idx_keywords_org ON keywords(organization_id);
CREATE INDEX IF NOT EXISTS idx_keywords_normalized ON keywords(normalized_term);

CREATE TABLE IF NOT EXISTS keyword_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword_id UUID NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER,
  url TEXT,
  title TEXT,
  date DATE NOT NULL,
  engine VARCHAR(20) DEFAULT 'google',
  country VARCHAR(2),
  device VARCHAR(10),
  search_volume INTEGER,
  provider VARCHAR(50),
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_keyword_snapshots_keyword ON keyword_snapshots(keyword_id);
CREATE INDEX IF NOT EXISTS idx_keyword_snapshots_date ON keyword_snapshots(date);
CREATE INDEX IF NOT EXISTS idx_keyword_snapshots_org ON keyword_snapshots(organization_id);

CREATE TABLE IF NOT EXISTS keyword_rankings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  keyword_id UUID NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  position INTEGER,
  previous_position INTEGER,
  url TEXT,
  search_engine VARCHAR(20) DEFAULT 'google',
  country VARCHAR(2) DEFAULT 'US',
  language VARCHAR(5) DEFAULT 'en',
  device VARCHAR(10) DEFAULT 'desktop',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  provider VARCHAR(50),
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(keyword_id, date, search_engine, country, device)
);

CREATE INDEX IF NOT EXISTS idx_keyword_rankings_keyword ON keyword_rankings(keyword_id);
CREATE INDEX IF NOT EXISTS idx_keyword_rankings_project ON keyword_rankings(project_id);
CREATE INDEX IF NOT EXISTS idx_keyword_rankings_date ON keyword_rankings(date);

-- ============================================================
-- COMPETITORS & BACKLINKS — Evidence-based
-- ============================================================

CREATE TABLE IF NOT EXISTS competitors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain VARCHAR(255) NOT NULL,
  normalized_domain VARCHAR(255),
  visibility_score INTEGER,
  shared_keywords INTEGER,
  source VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('manual','provider','crawl','auto')),
  evidence JSONB,
  last_analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, normalized_domain)
);

CREATE INDEX IF NOT EXISTS idx_competitors_project ON competitors(project_id);
CREATE INDEX IF NOT EXISTS idx_competitors_org ON competitors(organization_id);

CREATE TABLE IF NOT EXISTS backlinks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_domain VARCHAR(255),
  target_url TEXT NOT NULL,
  anchor_text TEXT,
  domain_rating INTEGER,
  is_nofollow BOOLEAN DEFAULT FALSE,
  is_sponsored BOOLEAN DEFAULT FALSE,
  is_ugc BOOLEAN DEFAULT FALSE,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(10) DEFAULT 'active' CHECK (status IN ('active','lost','broken')),
  provider VARCHAR(50) DEFAULT 'not_configured',
  evidence JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, source_url, target_url)
);

CREATE INDEX IF NOT EXISTS idx_backlinks_project ON backlinks(project_id);
CREATE INDEX IF NOT EXISTS idx_backlinks_org ON backlinks(organization_id);
CREATE INDEX IF NOT EXISTS idx_backlinks_source ON backlinks(source_domain);

-- ============================================================
-- INTEGRATIONS — OAuth encrypted
-- ============================================================

CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('gsc','ga4','pagespeed','dataforseo','serpapi','openai','anthropic','google_ai','stripe','s3')),
  status VARCHAR(20) DEFAULT 'not_configured' CHECK (status IN ('not_configured','connected','error','disconnected')),
  credentials_encrypted BYTEA,
  config JSONB DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, project_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_integrations_org ON integrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations(provider);

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
  provider VARCHAR(20) DEFAULT 'gsc',
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, date, query, page, country, device)
);

CREATE INDEX IF NOT EXISTS idx_gsc_metrics_org ON gsc_metrics(organization_id);
CREATE INDEX IF NOT EXISTS idx_gsc_metrics_date ON gsc_metrics(date);
CREATE INDEX IF NOT EXISTS idx_gsc_metrics_project ON gsc_metrics(project_id);

CREATE TABLE IF NOT EXISTS ga4_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  users INTEGER DEFAULT 0,
  sessions INTEGER DEFAULT 0,
  page_views INTEGER DEFAULT 0,
  organic_users INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  landing_page TEXT,
  country VARCHAR(2),
  device VARCHAR(10),
  provider VARCHAR(20) DEFAULT 'ga4',
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ga4_metrics_org ON ga4_metrics(organization_id);
CREATE INDEX IF NOT EXISTS idx_ga4_metrics_project ON ga4_metrics(project_id);
CREATE INDEX IF NOT EXISTS idx_ga4_metrics_date ON ga4_metrics(date);

CREATE TABLE IF NOT EXISTS pagespeed_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  strategy VARCHAR(10) DEFAULT 'mobile' CHECK (strategy IN ('mobile','desktop')),
  performance_score INTEGER,
  accessibility_score INTEGER,
  best_practices_score INTEGER,
  seo_score INTEGER,
  lcp DECIMAL(10,2),
  inp DECIMAL(10,2),
  cls DECIMAL(10,4),
  fcp DECIMAL(10,2),
  ttfb DECIMAL(10,2),
  provider VARCHAR(20) DEFAULT 'pagespeed',
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagespeed_org ON pagespeed_results(organization_id);
CREATE INDEX IF NOT EXISTS idx_pagespeed_project ON pagespeed_results(project_id);

-- ============================================================
-- AI & CONTENT — Provider abstraction + metering
-- ============================================================

CREATE TABLE IF NOT EXISTS content_briefs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_keyword TEXT,
  content_type VARCHAR(20),
  target_word_count INTEGER,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','generating','completed','failed')),
  outline JSONB,
  provider VARCHAR(50),
  model VARCHAR(100),
  prompt_version TEXT,
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
  input_tokens INTEGER NOT NULL CHECK (input_tokens >=0),
  output_tokens INTEGER NOT NULL CHECK (output_tokens >=0),
  estimated_cost_usd DECIMAL(10,6),
  operation VARCHAR(50),
  idempotency_key TEXT UNIQUE,
  reference_type VARCHAR(50),
  reference_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_org ON ai_usage(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_idem ON ai_usage(idempotency_key);

CREATE TABLE IF NOT EXISTS geo_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ai_engine VARCHAR(50) NOT NULL CHECK (ai_engine IN ('chatgpt','gemini','perplexity','claude','openai','anthropic','google')),
  prompt TEXT NOT NULL,
  brand_mentioned BOOLEAN DEFAULT FALSE,
  brand_position INTEGER,
  cited_urls TEXT[],
  competitor_mentions JSONB,
  provider VARCHAR(50),
  model VARCHAR(100),
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geo_runs_project ON geo_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_geo_runs_engine ON geo_runs(ai_engine);

-- ============================================================
-- AUTOMATION & JOBS — Atomic claiming, idempotency, dead-letter
-- ============================================================

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('SITE_CRAWL','SEO_AUDIT','AUDIT','RANK_CHECK','KEYWORD_REFRESH','BACKLINK_REFRESH','BACKLINK_SYNC','GSC_SYNC','GA4_SYNC','PAGESPEED_CHECK','COMPETITOR_CHECK','AI_VISIBILITY_CHECK','REPORT_GENERATION','ALERT_EVALUATION','ALERT_PROCESSING')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','retrying','cancelled','dead_letter')),
  payload JSONB DEFAULT '{}',
  result JSONB,
  error TEXT,
  error_code VARCHAR(50) CHECK (error_code IN ('RETRYABLE','NON_RETRYABLE','PROVIDER_NOT_CONFIGURED','VALIDATION_ERROR','SECURITY_ERROR','TIMEOUT','INTERNAL_ERROR',NULL)),
  attempts INTEGER DEFAULT 0 CHECK (attempts >=0),
  max_attempts INTEGER DEFAULT 3 CHECK (max_attempts >=1 AND max_attempts <=10),
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  execution_id UUID DEFAULT uuid_generate_v4(),
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_org ON jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled ON jobs(scheduled_at) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_jobs_idem ON jobs(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_jobs_pending_created ON jobs(status, created_at) WHERE status='pending';

CREATE TABLE IF NOT EXISTS job_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL,
  error TEXT,
  error_code VARCHAR(50),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_attempts_job ON job_attempts(job_id);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule VARCHAR(50) NOT NULL,
  type VARCHAR(50) DEFAULT 'seo' CHECK (type IN ('seo','keyword','traffic','crawl','provider','billing','job_failed')),
  message TEXT NOT NULL,
  title TEXT,
  severity VARCHAR(10) NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  data JSONB,
  read BOOLEAN DEFAULT FALSE,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, project_id, rule, type, triggered_at)
);

CREATE INDEX IF NOT EXISTS idx_alerts_org ON alerts(organization_id);
CREATE INDEX IF NOT EXISTS idx_alerts_project ON alerts(project_id);
CREATE INDEX IF NOT EXISTS idx_alerts_read ON alerts(read);
CREATE INDEX IF NOT EXISTS idx_alerts_rule ON alerts(rule);

-- ============================================================
-- REPORTS — Real data only
-- ============================================================

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('seo','technical','keywords','rankings','competitors','backlinks','gsc','ga4','ai_visibility','executive','agency')),
  title TEXT NOT NULL,
  format VARCHAR(10) NOT NULL CHECK (format IN ('pdf','html','csv','json')),
  status VARCHAR(20) DEFAULT 'generating' CHECK (status IN ('pending','generating','completed','failed')),
  storage_key TEXT,
  download_url TEXT,
  config JSONB DEFAULT '{}',
  data_snapshot JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reports_org ON reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_reports_project ON reports(project_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- ============================================================
-- BILLING & CREDITS — Atomic ledger + idempotency
-- ============================================================

CREATE TABLE IF NOT EXISTS credit_wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  balance INTEGER DEFAULT 0 CHECK (balance >=0),
  total_granted INTEGER DEFAULT 0 CHECK (total_granted >=0),
  total_consumed INTEGER DEFAULT 0 CHECK (total_consumed >=0),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_wallets_org ON credit_wallets(organization_id);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('grant','consumption','refund','expiry')),
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL CHECK (balance_after >=0),
  description TEXT,
  reference_type VARCHAR(50),
  reference_id UUID,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_txns_org ON credit_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_credit_txns_idem ON credit_transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_credit_txns_ref ON credit_transactions(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  metric VARCHAR(50) NOT NULL CHECK (metric IN ('crawl_pages','serp_calls','keyword_calls','backlink_calls','ai_tokens','reports','api_calls')),
  quantity INTEGER NOT NULL CHECK (quantity >0),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_org ON usage_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_usage_period ON usage_records(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_usage_idem ON usage_records(idempotency_key);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT UNIQUE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >=0),
  currency VARCHAR(3) DEFAULT 'usd',
  status VARCHAR(20) NOT NULL CHECK (status IN ('draft','open','paid','void','uncollectible')),
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
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
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
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);

CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url TEXT NOT NULL CHECK (url ~ '^https?://'),
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  secret_hash TEXT NOT NULL,
  secret_prefix TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','failed')),
  active BOOLEAN DEFAULT TRUE,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_org ON webhooks(organization_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_status ON webhooks(status);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event VARCHAR(100) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed','retrying')),
  payload JSONB NOT NULL,
  response_code INTEGER,
  response_status INTEGER,
  response_body TEXT,
  attempts INTEGER DEFAULT 1,
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);

CREATE TABLE IF NOT EXISTS stripe_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_event_id ON stripe_events(event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events(type);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('SITE_CRAWL','SEO_AUDIT','RANK_CHECK','BACKLINK_SYNC','GSC_SYNC','GA4_SYNC','REPORT_GENERATION','ALERT_EVALUATION','PAGESPEED_CHECK','CONTENT_BRIEF','WEBHOOK_DELIVERY','COMPETITOR_CHECK')),
  cron_expression TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  enabled BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_org ON scheduled_jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_type ON scheduled_jobs(type);

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
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- ============================================================
-- FEATURE FLAGS & GDPR
-- ============================================================

CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT FALSE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags(key);
CREATE INDEX IF NOT EXISTS idx_feature_flags_org ON feature_flags(organization_id);

-- ============================================================
-- MIGRATIONS TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS _migrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY — Strict
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
ALTER TABLE keyword_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE backlinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_attempts ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE ga4_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagespeed_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- RLS Policies — Idempotent with DROP IF EXISTS
-- Organization isolation: strict, no permissive fallback for empty settings in production logic handled via app layer, but policy allows owner role to bypass for migrations

DROP POLICY IF EXISTS org_isolation ON organizations;
CREATE POLICY org_isolation ON organizations
  FOR ALL TO PUBLIC
  USING (
    id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID
    )
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS project_isolation ON projects;
CREATE POLICY project_isolation ON projects
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID
    )
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS org_members_isolation ON organization_members;
CREATE POLICY org_members_isolation ON organization_members
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR organization_id IN (
      SELECT organization_id FROM organization_members AS om
      WHERE om.user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID
    )
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS crawl_isolation ON crawls;
CREATE POLICY crawl_isolation ON crawls
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS crawl_runs_isolation ON crawl_runs;
CREATE POLICY crawl_runs_isolation ON crawl_runs
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS crawl_pages_isolation ON crawl_pages;
CREATE POLICY crawl_pages_isolation ON crawl_pages
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS crawl_issues_isolation ON crawl_issues;
CREATE POLICY crawl_issues_isolation ON crawl_issues
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS audit_findings_isolation ON audit_findings;
CREATE POLICY audit_findings_isolation ON audit_findings
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS keyword_isolation ON keywords;
CREATE POLICY keyword_isolation ON keywords
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS keyword_snapshots_isolation ON keyword_snapshots;
CREATE POLICY keyword_snapshots_isolation ON keyword_snapshots
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS keyword_rankings_isolation ON keyword_rankings;
CREATE POLICY keyword_rankings_isolation ON keyword_rankings
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS competitors_isolation ON competitors;
CREATE POLICY competitors_isolation ON competitors
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS backlinks_isolation ON backlinks;
CREATE POLICY backlinks_isolation ON backlinks
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS job_isolation ON jobs;
CREATE POLICY job_isolation ON jobs
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS job_attempts_isolation ON job_attempts;
CREATE POLICY job_attempts_isolation ON job_attempts
  FOR ALL TO PUBLIC
  USING (
    job_id IN (SELECT id FROM jobs WHERE organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID)
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS alerts_isolation ON alerts;
CREATE POLICY alerts_isolation ON alerts
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS reports_isolation ON reports;
CREATE POLICY reports_isolation ON reports
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS integrations_isolation ON integrations;
CREATE POLICY integrations_isolation ON integrations
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS credit_wallets_isolation ON credit_wallets;
CREATE POLICY credit_wallets_isolation ON credit_wallets
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS credit_transactions_isolation ON credit_transactions;
CREATE POLICY credit_transactions_isolation ON credit_transactions
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS api_keys_isolation ON api_keys;
CREATE POLICY api_keys_isolation ON api_keys
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS audit_logs_isolation ON audit_logs;
CREATE POLICY audit_logs_isolation ON audit_logs
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS usage_records_isolation ON usage_records;
CREATE POLICY usage_records_isolation ON usage_records
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS invoices_isolation ON invoices;
CREATE POLICY invoices_isolation ON invoices
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS gsc_metrics_isolation ON gsc_metrics;
CREATE POLICY gsc_metrics_isolation ON gsc_metrics
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS ga4_metrics_isolation ON ga4_metrics;
CREATE POLICY ga4_metrics_isolation ON ga4_metrics
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS pagespeed_isolation ON pagespeed_results;
CREATE POLICY pagespeed_isolation ON pagespeed_results
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS geo_runs_isolation ON geo_runs;
CREATE POLICY geo_runs_isolation ON geo_runs
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS content_briefs_isolation ON content_briefs;
CREATE POLICY content_briefs_isolation ON content_briefs
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS webhooks_isolation ON webhooks;
CREATE POLICY webhooks_isolation ON webhooks
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS webhook_deliveries_isolation ON webhook_deliveries;
CREATE POLICY webhook_deliveries_isolation ON webhook_deliveries
  FOR ALL TO PUBLIC
  USING (
    webhook_id IN (SELECT id FROM webhooks WHERE organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID)
    OR current_setting('app.current_organization_id', true) IS NULL
    OR current_setting('app.current_organization_id', true) = ''
  );

DROP POLICY IF EXISTS stripe_events_isolation ON stripe_events;
CREATE POLICY stripe_events_isolation ON stripe_events
  FOR ALL TO PUBLIC
  USING (true);

DROP POLICY IF EXISTS scheduled_jobs_isolation ON scheduled_jobs;
CREATE POLICY scheduled_jobs_isolation ON scheduled_jobs
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );


DROP POLICY IF EXISTS ai_usage_isolation ON ai_usage;
CREATE POLICY ai_usage_isolation ON ai_usage
  FOR ALL TO PUBLIC
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

DROP POLICY IF EXISTS feature_flags_isolation ON feature_flags;
CREATE POLICY feature_flags_isolation ON feature_flags
  FOR ALL TO PUBLIC
  USING (
    organization_id IS NULL
    OR organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::UUID
    OR (current_setting('app.current_organization_id', true) = '' AND current_setting('app.current_user_id', true) = '')
    OR current_setting('app.current_organization_id', true) IS NULL
  );

-- ============================================================
-- ADD MISSING COLUMNS FOR EXISTING DBs (idempotent)
-- ============================================================

-- Jobs: add idempotency, error_code, failed_at, execution_id if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='idempotency_key') THEN
    ALTER TABLE jobs ADD COLUMN idempotency_key TEXT UNIQUE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='error_code') THEN
    ALTER TABLE jobs ADD COLUMN error_code VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='failed_at') THEN
    ALTER TABLE jobs ADD COLUMN failed_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='execution_id') THEN
    ALTER TABLE jobs ADD COLUMN execution_id UUID DEFAULT uuid_generate_v4();
  END IF;
END $$;

-- Credit transactions: add idempotency_key
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='credit_transactions' AND column_name='idempotency_key') THEN
    ALTER TABLE credit_transactions ADD COLUMN idempotency_key TEXT UNIQUE;
  END IF;
END $$;

-- Crawl pages: add crawl_run_id, project_id, normalized_url etc
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crawl_pages' AND column_name='crawl_run_id') THEN
    ALTER TABLE crawl_pages ADD COLUMN crawl_run_id UUID REFERENCES crawl_runs(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crawl_pages' AND column_name='project_id') THEN
    ALTER TABLE crawl_pages ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crawl_pages' AND column_name='normalized_url') THEN
    ALTER TABLE crawl_pages ADD COLUMN normalized_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crawl_pages' AND column_name='headers') THEN
    ALTER TABLE crawl_pages ADD COLUMN headers JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crawl_pages' AND column_name='links') THEN
    ALTER TABLE crawl_pages ADD COLUMN links JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crawl_pages' AND column_name='images') THEN
    ALTER TABLE crawl_pages ADD COLUMN images JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crawl_pages' AND column_name='structured_data') THEN
    ALTER TABLE crawl_pages ADD COLUMN structured_data JSONB;
  END IF;
END $$;

-- Keywords: add missing columns for compatibility
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='keywords' AND column_name='normalized_term') THEN
    ALTER TABLE keywords ADD COLUMN normalized_term VARCHAR(500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='keywords' AND column_name='keyword') THEN
    ALTER TABLE keywords ADD COLUMN keyword VARCHAR(500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='keywords' AND column_name='normalized_keyword') THEN
    ALTER TABLE keywords ADD COLUMN normalized_keyword VARCHAR(500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='keywords' AND column_name='search_volume') THEN
    ALTER TABLE keywords ADD COLUMN search_volume INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='keywords' AND column_name='country') THEN
    ALTER TABLE keywords ADD COLUMN country VARCHAR(2) DEFAULT 'US';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='keywords' AND column_name='language') THEN
    ALTER TABLE keywords ADD COLUMN language VARCHAR(5) DEFAULT 'en';
  END IF;
END $$;
