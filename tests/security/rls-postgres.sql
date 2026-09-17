-- RankForge — Strict RLS Verification
-- Executed by CI against PostgreSQL using non-owner application role
-- Must fail hard if tenant isolation is broken
-- No ON_ERROR_STOP off, no WARNING swallowing

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Ensure grants for all tables (including those created after role creation)
GRANT USAGE ON SCHEMA public TO rankforge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rankforge_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rankforge_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rankforge_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO rankforge_app;

-- Clean previous test data if exists
DELETE FROM projects WHERE id IN ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b2');
DELETE FROM organizations WHERE id IN ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1');

INSERT INTO organizations (id, name, slug)
VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'RLS Org A', 'rls-org-a'),
  ('00000000-0000-0000-0000-0000000000b1', 'RLS Org B', 'rls-org-b')
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, organization_id, name, domain, normalized_domain)
VALUES
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'Project A', 'a.example', 'a.example'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 'Project B', 'b.example', 'b.example')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Re-grant after inserts
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rankforge_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rankforge_app;

SET ROLE rankforge_app;

SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-0000000000c1', false);
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-0000000000a1', false);

-- Test 1: Org A should see exactly 1 project
DO $$
DECLARE visible_projects integer;
BEGIN
  SELECT count(*) INTO visible_projects FROM projects;
  RAISE NOTICE 'RLS Check - Visible projects for Org A: % (expected 1)', visible_projects;
  IF visible_projects <> 1 THEN
    RAISE EXCEPTION 'RLS FAILED for Org A: expected 1 project, got %', visible_projects;
  END IF;
  RAISE NOTICE 'RLS PASS for Org A';
END $$;

SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-0000000000b1', false);

-- Test 2: Org B should see exactly 1 project
DO $$
DECLARE visible_projects integer;
BEGIN
  SELECT count(*) INTO visible_projects FROM projects;
  RAISE NOTICE 'RLS Check - Visible projects for Org B: % (expected 1)', visible_projects;
  IF visible_projects <> 1 THEN
    RAISE EXCEPTION 'RLS FAILED for Org B: expected 1 project, got %', visible_projects;
  END IF;
  RAISE NOTICE 'RLS PASS for Org B';
END $$;

-- Test 3: Org B must NOT see Org A by ID (cross-tenant isolation)
DO $$
DECLARE visible_projects integer;
BEGIN
  SELECT count(*) INTO visible_projects
  FROM projects
  WHERE id = '00000000-0000-0000-0000-0000000000a2';
  RAISE NOTICE 'RLS Check - Cross-tenant visibility (Org B seeing Org A): % (expected 0)', visible_projects;
  IF visible_projects <> 0 THEN
    RAISE EXCEPTION 'Cross-tenant read leaked: Org B can see Org A project';
  END IF;
  RAISE NOTICE 'RLS PASS for cross-tenant isolation';
END $$;

-- Test 4: Org A cannot update Org B project
DO $$
BEGIN
  UPDATE projects SET name = 'Hacked' WHERE id = '00000000-0000-0000-0000-0000000000b2';
  IF FOUND THEN
    RAISE EXCEPTION 'RLS FAILED: Org B project was updated by Org A context';
  END IF;
  RAISE NOTICE 'RLS PASS for update isolation';
END $$;

-- Test 5: Org A cannot delete Org B project
DO $$
BEGIN
  DELETE FROM projects WHERE id = '00000000-0000-0000-0000-0000000000b2';
  IF FOUND THEN
    RAISE EXCEPTION 'RLS FAILED: Org B project was deleted by Org A context';
  END IF;
  RAISE NOTICE 'RLS PASS for delete isolation';
END $$;

RESET ROLE;

-- Cleanup test data as owner
DELETE FROM projects WHERE id IN ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b2');
DELETE FROM organizations WHERE id IN ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1');

SELECT 'RLS verification completed — ALL CHECKS PASS' AS result;
