-- Migration 016: the API stops using the database owner.
--
-- rankforge_api      serves authenticated requests. Subject to RLS, so a query that forgets
--                    its organization filter still sees only the caller's tenant.
-- rankforge_api_system  serves the few flows that have no tenant yet (login, signup, refresh,
--                    password reset, signed webhooks). Bypasses RLS but cannot change schema.
-- Neither is a superuser or owns a table, so SQL injection cannot alter or drop anything.
--
-- Residual risk: like any custom GUC, the tenant setting can be changed by a role that can run
-- arbitrary SQL. RLS here protects against missing filters, not against SQL injection reads.

DO $$
DECLARE r TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rankforge_api') THEN
    CREATE ROLE rankforge_api NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rankforge_api_system') THEN
    CREATE ROLE rankforge_api_system NOLOGIN NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  FOREACH r IN ARRAY ARRAY['rankforge_api', 'rankforge_api_system'] LOOP
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', r);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', r);
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', r);
    EXECUTE format('REVOKE ALL ON rf_worker_bindings, _migrations FROM %I', r);
  END LOOP;
END $$;

-- The queue is written by the API, but the ledger and credentials must never be readable across
-- tenants. These tables had no RLS because they are read before a tenant is known.
REVOKE ALL ON password_reset_tokens, auth_refresh_tokens FROM rankforge_api;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_self_or_colleague ON users;
CREATE POLICY users_self_or_colleague ON users FOR ALL TO rankforge_api
  USING (
    id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR id IN (SELECT user_id FROM organization_members)
  )
  WITH CHECK (id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_sessions_own ON auth_sessions;
CREATE POLICY auth_sessions_own ON auth_sessions FOR ALL TO rankforge_api
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

-- Global flags have no organization; they are readable, and only the owning tenant may write.
DROP POLICY IF EXISTS feature_flags_global_read ON feature_flags;
CREATE POLICY feature_flags_global_read ON feature_flags FOR SELECT TO rankforge_api USING (organization_id IS NULL);

