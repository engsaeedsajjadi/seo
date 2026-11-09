-- Migration 024: referring domains from the Common Crawl web graph, and link-building prospects.
--
-- Common Crawl publishes a domain-level link graph every few months. One BACKLINK_DISCOVERY job
-- streams it once for all of an organization's projects and competitors and stores which domains
-- link to each. Domains that link to competitors but not to the project become prospects that a
-- person works through (contact, won, rejected).

-- A long job keeps its lease while it streams the graph; only the execution that holds it can extend it.
CREATE OR REPLACE FUNCTION rf_worker_extend_lease(p_job_id UUID, p_execution_id UUID, p_seconds INT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_seconds IS NULL OR p_seconds < 60 OR p_seconds > 3600 THEN
    RAISE EXCEPTION 'rf_worker_extend_lease: argument out of range' USING ERRCODE = '22023';
  END IF;
  UPDATE jobs SET lease_expires_at = NOW() + make_interval(secs => p_seconds)
    WHERE id = p_job_id AND execution_id = p_execution_id AND status = 'running';
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION rf_worker_extend_lease(UUID, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rf_worker_extend_lease(UUID, UUID, INT) TO rankforge_worker;

CREATE TABLE IF NOT EXISTS link_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- NULL: links to the project itself; otherwise to this competitor.
  competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE,
  target_domain TEXT NOT NULL CHECK (length(target_domain) <= 255),
  referring_domain TEXT NOT NULL CHECK (length(referring_domain) <= 255),
  first_release TEXT NOT NULL CHECK (length(first_release) <= 100),
  last_release TEXT NOT NULL CHECK (length(last_release) <= 100),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'lost')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS link_domains_unique
  ON link_domains (project_id, COALESCE(competitor_id, '00000000-0000-0000-0000-000000000000'::uuid), referring_domain);
CREATE INDEX IF NOT EXISTS link_domains_org ON link_domains (organization_id);

CREATE TABLE IF NOT EXISTS link_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  referring_domain TEXT NOT NULL CHECK (length(referring_domain) <= 255),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'to_contact', 'contacted', 'won', 'rejected')),
  note TEXT CHECK (note IS NULL OR length(note) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, referring_domain)
);
CREATE INDEX IF NOT EXISTS link_prospects_org ON link_prospects (organization_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['link_domains', 'link_prospects'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I FOR ALL
      USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
      WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)$p$, t);
    EXECUTE format('DROP POLICY IF EXISTS rf_worker_lease_guard ON %I', t);
    EXECUTE format($p$CREATE POLICY rf_worker_lease_guard ON %I AS RESTRICTIVE FOR ALL TO rankforge_worker
      USING (organization_id = (SELECT rf_worker_current_org()))
      WITH CHECK (organization_id = (SELECT rf_worker_current_org()))$p$, t);
  END LOOP;
END $$;

GRANT SELECT ON link_domains TO rankforge_api, rankforge_api_system;
GRANT SELECT, INSERT, UPDATE ON link_prospects TO rankforge_api, rankforge_api_system;
GRANT SELECT, INSERT, UPDATE ON link_domains TO rankforge_worker;
GRANT SELECT (project_id, referring_domain), INSERT ON link_prospects TO rankforge_worker;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_type_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_type_check CHECK (type IN (
  'SITE_CRAWL','SEO_AUDIT','AUDIT','RANK_CHECK','KEYWORD_REFRESH','BACKLINK_REFRESH','BACKLINK_SYNC','GSC_SYNC','GA4_SYNC',
  'PAGESPEED_CHECK','COMPETITOR_CHECK','AI_VISIBILITY_CHECK','CONTENT_BRIEF','REPORT_GENERATION','ALERT_EVALUATION',
  'ALERT_PROCESSING','WEBHOOK_DELIVERY','FIX_SUGGESTIONS','CONTENT_DRAFT','BACKLINK_DISCOVERY'));
