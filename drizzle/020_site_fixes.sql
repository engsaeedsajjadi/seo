-- Migration 020: fixes that the WordPress plugin applies to a customer's site.
--
-- The app proposes a value, the customer approves or edits it, the plugin applies it and keeps
-- the previous value so the change can be rolled back. Nothing reaches a site without approval.

CREATE TABLE IF NOT EXISTS site_fixes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('meta_title', 'meta_description', 'image_alt')),
  page_url TEXT NOT NULL CHECK (length(page_url) <= 2048),
  -- For image_alt: the image address on the page.
  target TEXT CHECK (target IS NULL OR length(target) <= 2048),
  current_value TEXT CHECK (current_value IS NULL OR length(current_value) <= 1000),
  proposed_value TEXT NOT NULL CHECK (length(proposed_value) BETWEEN 1 AND 500),
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'applied', 'rejected', 'rollback_requested', 'rolled_back', 'failed')),
  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'plugin', 'rule')),
  previous_value TEXT CHECK (previous_value IS NULL OR length(previous_value) <= 1000),
  error TEXT CHECK (error IS NULL OR length(error) <= 500),
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One open fix per field of a page, so repeated suggestions do not pile up.
CREATE UNIQUE INDEX IF NOT EXISTS site_fixes_open_unique
  ON site_fixes (project_id, kind, page_url, COALESCE(target, ''))
  WHERE status IN ('proposed', 'approved', 'applied', 'rollback_requested');
CREATE INDEX IF NOT EXISTS site_fixes_project_status ON site_fixes (project_id, status);
CREATE INDEX IF NOT EXISTS site_fixes_org ON site_fixes (organization_id);

ALTER TABLE site_fixes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON site_fixes;
CREATE POLICY tenant_isolation ON site_fixes FOR ALL
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- The Worker writes suggestions only for the organization of the job it holds.
DROP POLICY IF EXISTS rf_worker_lease_guard ON site_fixes;
CREATE POLICY rf_worker_lease_guard ON site_fixes AS RESTRICTIVE FOR ALL TO rankforge_worker
  USING (organization_id = (SELECT rf_worker_current_org()))
  WITH CHECK (organization_id = (SELECT rf_worker_current_org()));

GRANT SELECT, INSERT, UPDATE, DELETE ON site_fixes TO rankforge_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON site_fixes TO rankforge_api_system;
GRANT SELECT (id, organization_id, project_id, kind, page_url, target, status), INSERT ON site_fixes TO rankforge_worker;

-- The suggestion job reads the latest crawl.
GRANT SELECT (id, organization_id, project_id, status, created_at, completed_at) ON crawl_runs TO rankforge_worker;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_type_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_type_check CHECK (type IN (
  'SITE_CRAWL','SEO_AUDIT','AUDIT','RANK_CHECK','KEYWORD_REFRESH','BACKLINK_REFRESH','BACKLINK_SYNC','GSC_SYNC','GA4_SYNC',
  'PAGESPEED_CHECK','COMPETITOR_CHECK','AI_VISIBILITY_CHECK','CONTENT_BRIEF','REPORT_GENERATION','ALERT_EVALUATION',
  'ALERT_PROCESSING','WEBHOOK_DELIVERY','FIX_SUGGESTIONS'));

-- When the plugin last checked in, so the app can show whether a site is connected.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS wp_plugin_seen_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS wp_plugin_version TEXT;
