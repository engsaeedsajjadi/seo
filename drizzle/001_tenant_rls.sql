-- RankForge tenant isolation policy migration.
-- API requests set app.current_organization_id and app.current_user_id.
-- Policies intentionally key tenant data to the request organization context.

DO $$
DECLARE
  table_name text;
  tenant_tables text[] := ARRAY[
    'organizations', 'organization_members', 'projects', 'crawls', 'crawl_pages',
    'crawl_issues', 'keywords', 'keyword_snapshots', 'competitors', 'backlinks',
    'integrations', 'gsc_metrics', 'content_briefs', 'ai_usage', 'geo_runs',
    'jobs', 'alerts', 'reports', 'credit_wallets', 'credit_transactions',
    'usage_records', 'invoices', 'api_keys', 'audit_logs'
  ];
BEGIN
  FOREACH table_name IN ARRAY tenant_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format($policy$
      CREATE POLICY tenant_isolation ON %I
      FOR ALL
      USING (
        organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
      )
      WITH CHECK (
        organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
      )
    $policy$, table_name);
  END LOOP;
END $$;

-- The organizations table has the tenant id as its primary key.
DROP POLICY IF EXISTS tenant_isolation ON organizations;
CREATE POLICY tenant_isolation ON organizations
  FOR ALL
  USING (id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- Keep a lightweight membership policy that permits a user to inspect only
-- memberships belonging to their active tenant.
DROP POLICY IF EXISTS tenant_isolation ON organization_members;
CREATE POLICY tenant_isolation ON organization_members
  FOR ALL
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );
