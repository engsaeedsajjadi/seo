-- PostgreSQL combines permissive policies with OR. Merely adding a strict policy
-- did not remove the baseline empty-context bypass or its recursive membership policy.
DO $$
DECLARE target record; policy record;
BEGIN
  FOR target IN
    SELECT t.table_name FROM information_schema.tables t
    JOIN information_schema.columns c ON c.table_schema=t.table_schema AND c.table_name=t.table_name
    WHERE t.table_schema=current_schema() AND c.column_name='organization_id'
      AND t.table_type='BASE TABLE' AND t.table_name NOT IN ('auth_sessions')
    UNION SELECT 'organizations'
  LOOP
    FOR policy IN SELECT policyname FROM pg_policies WHERE schemaname=current_schema() AND tablename=target.table_name
    LOOP
      EXECUTE format('DROP POLICY %I ON %I',policy.policyname,target.table_name);
    END LOOP;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',target.table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL USING (%I = NULLIF(current_setting(''app.current_organization_id'',true),'''')::uuid) WITH CHECK (%I = NULLIF(current_setting(''app.current_organization_id'',true),'''')::uuid)',
      target.table_name,CASE WHEN target.table_name='organizations' THEN 'id' ELSE 'organization_id' END,
      CASE WHEN target.table_name='organizations' THEN 'id' ELSE 'organization_id' END);
  END LOOP;
END $$;
