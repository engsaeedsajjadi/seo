-- Executed by CI against PostgreSQL using a non-owner application role.
-- This proves isolation at the database layer rather than only in application code.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

SET ROLE rankforge_app;

SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-0000000000c1', false);
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-0000000000a1', false);

DO $$
DECLARE visible_projects integer;
BEGIN
  SELECT count(*) INTO visible_projects FROM projects;
  IF visible_projects <> 1 THEN
    RAISE EXCEPTION 'RLS failed for Org A: expected 1 project, got %', visible_projects;
  END IF;
END $$;

SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-0000000000b1', false);

DO $$
DECLARE visible_projects integer;
BEGIN
  SELECT count(*) INTO visible_projects FROM projects;
  IF visible_projects <> 1 THEN
    RAISE EXCEPTION 'RLS failed for Org B: expected 1 project, got %', visible_projects;
  END IF;
END $$;

-- Org B must not see Org A by ID.
DO $$
DECLARE visible_projects integer;
BEGIN
  SELECT count(*) INTO visible_projects
  FROM projects
  WHERE id = '00000000-0000-0000-0000-0000000000a2';
  IF visible_projects <> 0 THEN
    RAISE EXCEPTION 'Cross-tenant read was possible: Org B can see Org A project';
  END IF;
END $$;

RESET ROLE;
