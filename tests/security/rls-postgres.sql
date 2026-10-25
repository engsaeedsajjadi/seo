-- Run as the migration owner: fixtures/grants require owner privileges.
-- Actual assertions run as a separate NOSUPERUSER NOBYPASSRLS role.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rankforge_app') THEN
    CREATE ROLE rankforge_app NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO rankforge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rankforge_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rankforge_app;
INSERT INTO users (id,email,name,password_hash) VALUES
('00000000-0000-0000-0000-0000000000c1','rls-a@example.test','RLS A','unused-test-hash'),
('00000000-0000-0000-0000-0000000000c2','rls-b@example.test','RLS B','unused-test-hash');
INSERT INTO organizations (id,name,slug,owner_id) VALUES
('00000000-0000-0000-0000-0000000000a1','RLS Org A','rls-org-a','00000000-0000-0000-0000-0000000000c1'),
('00000000-0000-0000-0000-0000000000b1','RLS Org B','rls-org-b','00000000-0000-0000-0000-0000000000c2');
INSERT INTO organization_members (organization_id,user_id,role) VALUES
('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','Owner'),
('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c2','Owner');
INSERT INTO projects (id,organization_id,name,domain,normalized_domain) VALUES
('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a1','Project A','a.example','a.example'),
('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b1','Project B','b.example','b.example');
COMMIT;
SET ROLE rankforge_app;
SELECT set_config('app.current_user_id','00000000-0000-0000-0000-0000000000c1',false);
SELECT set_config('app.current_organization_id','00000000-0000-0000-0000-0000000000a1',false);
DO $$ BEGIN
  IF (SELECT count(*) FROM projects)<>1 THEN RAISE EXCEPTION 'RLS: wrong project count'; END IF;
  IF (SELECT count(*) FROM organization_members)<>1 THEN RAISE EXCEPTION 'RLS: wrong member count'; END IF;
  IF EXISTS (SELECT 1 FROM projects WHERE id='00000000-0000-0000-0000-0000000000b2') THEN RAISE EXCEPTION 'RLS: cross-tenant read'; END IF;
  UPDATE projects SET name='Hacked' WHERE id='00000000-0000-0000-0000-0000000000b2';
  IF FOUND THEN RAISE EXCEPTION 'RLS: cross-tenant update'; END IF;
  DELETE FROM projects WHERE id='00000000-0000-0000-0000-0000000000b2';
  IF FOUND THEN RAISE EXCEPTION 'RLS: cross-tenant delete'; END IF;
  BEGIN
    INSERT INTO projects(organization_id,name,domain,normalized_domain) VALUES ('00000000-0000-0000-0000-0000000000b1','Injected','injected.test','injected.test');
    RAISE EXCEPTION 'RLS: cross-tenant insert';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SELECT set_config('app.current_organization_id','00000000-0000-0000-0000-0000000000b1',false);
DO $$ BEGIN
  IF (SELECT count(*) FROM projects)<>1 THEN RAISE EXCEPTION 'RLS: second tenant count'; END IF;
END $$;
SELECT set_config('app.current_organization_id','',false);
SELECT set_config('app.current_user_id','',false);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM projects) OR EXISTS(SELECT 1 FROM organization_members) THEN RAISE EXCEPTION 'RLS: empty context leaked data'; END IF;
END $$;
RESET ROLE;
DELETE FROM projects WHERE id IN ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000b2');
DELETE FROM organizations WHERE id IN ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1');
DELETE FROM users WHERE id IN ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c2');
SELECT 'RLS verification completed — ALL CHECKS PASS';
