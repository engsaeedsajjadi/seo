-- Migration 015: least-privilege Worker role with lease-bound tenancy.
--
-- Problem: every tenant policy trusts the custom GUC app.current_organization_id,
-- and any role may SET a custom GUC. A compromised restricted role could therefore
-- read another tenant's rows just by changing that setting.
--
-- Fix: rankforge_worker is additionally subject to a RESTRICTIVE policy that takes
-- the tenant from a private binding table which only rf_worker_bind_job() can write,
-- and only for a job that is currently running under the presented execution_id.
-- The GUC alone no longer grants the Worker anything.
--
-- Residual risk: a compromised Worker can still claim queued jobs, which gives it the
-- tenants of those jobs for the job's lifetime. Tenants with no active job stay closed.
--
-- Numbered 015 so it stays ordered after any unpublished 005-014 work. Every statement
-- is idempotent and uses rf_-prefixed names to avoid colliding with such work.

-- ---------------------------------------------------------------- roles
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rankforge_worker') THEN
    CREATE ROLE rankforge_worker NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM rankforge_worker;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM rankforge_worker;
REVOKE ALL ON SCHEMA public FROM rankforge_worker;
GRANT USAGE ON SCHEMA public TO rankforge_worker;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- ---------------------------------------------------------------- schema support
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_error_code_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_error_code_check CHECK (error_code IS NULL OR error_code IN (
  'RETRYABLE','NON_RETRYABLE','PROVIDER_NOT_CONFIGURED','VALIDATION_ERROR','SECURITY_ERROR',
  'TIMEOUT','INTERNAL_ERROR','INSUFFICIENT_CREDITS','QUOTA_EXCEEDED'));

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_type_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_type_check CHECK (type IN (
  'SITE_CRAWL','SEO_AUDIT','AUDIT','RANK_CHECK','KEYWORD_REFRESH','BACKLINK_REFRESH','BACKLINK_SYNC','GSC_SYNC','GA4_SYNC',
  'PAGESPEED_CHECK','COMPETITOR_CHECK','AI_VISIBILITY_CHECK','CONTENT_BRIEF','REPORT_GENERATION','ALERT_EVALUATION',
  'ALERT_PROCESSING','WEBHOOK_DELIVERY'));

-- A suspended customer keeps their data, but none of their jobs run.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_jobs_claimable ON jobs (created_at)
  WHERE status IN ('pending','retrying');
CREATE INDEX IF NOT EXISTS idx_jobs_running_lease ON jobs (lease_expires_at)
  WHERE status = 'running';

DELETE FROM job_attempts a USING job_attempts b
  WHERE a.job_id = b.job_id AND a.attempt_number = b.attempt_number AND a.ctid > b.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_attempts_job_attempt ON job_attempts (job_id, attempt_number);

-- One unread system alert per project and rule. triggered_at made the old unique
-- constraint useless for de-duplication because NOW() differs on every run.
UPDATE alerts a SET read = true
  WHERE a.read = false
    AND a.rule IN ('critical_issues','low_seo_score','job_dead_letter')
    AND EXISTS (SELECT 1 FROM alerts n
                WHERE n.organization_id = a.organization_id AND n.project_id = a.project_id
                  AND n.rule = a.rule AND n.type = a.type AND n.read = false
                  AND (n.triggered_at, n.id) > (a.triggered_at, a.id));
CREATE UNIQUE INDEX IF NOT EXISTS uq_alerts_open_system_rule
  ON alerts (organization_id, project_id, rule, type)
  WHERE read = false AND rule IN ('critical_issues','low_seo_score','job_dead_letter');

CREATE UNLOGGED TABLE IF NOT EXISTS rf_worker_bindings (
  backend_pid     INT PRIMARY KEY,
  xact_id         XID8 NOT NULL,
  job_id          UUID NOT NULL,
  execution_id    UUID NOT NULL,
  organization_id UUID NOT NULL
);
REVOKE ALL ON rf_worker_bindings FROM PUBLIC;
ALTER TABLE rf_worker_bindings ENABLE ROW LEVEL SECURITY; -- no policy: reachable only by its definer functions

-- ---------------------------------------------------------------- tenant binding
CREATE OR REPLACE FUNCTION rf_worker_current_org() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT b.organization_id
  FROM rf_worker_bindings b
  JOIN jobs j ON j.id = b.job_id AND j.execution_id = b.execution_id AND j.status = 'running'
  WHERE b.backend_pid = pg_backend_pid() AND b.xact_id = pg_current_xact_id();
$$;

CREATE OR REPLACE FUNCTION rf_worker_bind_job(p_job_id UUID, p_execution_id UUID) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_org UUID;
BEGIN
  SELECT organization_id INTO v_org FROM jobs
    WHERE id = p_job_id AND execution_id = p_execution_id AND status = 'running';
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'rf_worker_bind_job: no running job for this execution' USING ERRCODE = '42501';
  END IF;
  INSERT INTO rf_worker_bindings (backend_pid, xact_id, job_id, execution_id, organization_id)
    VALUES (pg_backend_pid(), pg_current_xact_id(), p_job_id, p_execution_id, v_org)
    ON CONFLICT (backend_pid) DO UPDATE SET xact_id = EXCLUDED.xact_id, job_id = EXCLUDED.job_id,
      execution_id = EXCLUDED.execution_id, organization_id = EXCLUDED.organization_id;
  PERFORM set_config('app.current_organization_id', v_org::text, true);
  RETURN v_org;
END $$;

-- ---------------------------------------------------------------- terminal-state helper
CREATE OR REPLACE FUNCTION rf__dead_letter(p_job_id UUID, p_message TEXT, p_code TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  j jobs%ROWTYPE;
  v_charge credit_transactions%ROWTYPE;
  v_balance INT;
BEGIN
  UPDATE jobs SET status = 'dead_letter', error = p_message, error_code = p_code,
         completed_at = NOW(), failed_at = NOW(), lease_expires_at = NULL
    WHERE id = p_job_id RETURNING * INTO j;

  -- Move the customer-visible record out of its in-progress state.
  IF j.payload ? 'crawlRunId' THEN
    UPDATE crawl_runs SET status = 'failed', completed_at = NOW()
      WHERE id = (j.payload->>'crawlRunId')::uuid AND organization_id = j.organization_id;
  END IF;
  UPDATE crawl_runs SET status = 'failed', completed_at = NOW()
    WHERE organization_id = j.organization_id AND config->>'jobId' = j.id::text
      AND status <> 'completed';
  IF j.payload ? 'briefId' THEN
    UPDATE content_briefs SET status = 'failed', updated_at = NOW()
      WHERE id = (j.payload->>'briefId')::uuid AND organization_id = j.organization_id;
  END IF;
  IF j.payload ? 'reportId' THEN
    UPDATE reports SET status = 'failed'
      WHERE id = (j.payload->>'reportId')::uuid AND organization_id = j.organization_id;
  END IF;

  -- A job that delivered nothing must not cost anything.
  SELECT * INTO v_charge FROM credit_transactions WHERE idempotency_key = 'job_charge_' || j.id;
  IF FOUND THEN
    UPDATE credit_wallets SET balance = balance - v_charge.amount,
           total_consumed = GREATEST(total_consumed + v_charge.amount, 0), updated_at = NOW()
      WHERE organization_id = j.organization_id
        AND NOT EXISTS (SELECT 1 FROM credit_transactions WHERE idempotency_key = 'job_refund_' || j.id)
      RETURNING balance INTO v_balance;
    IF v_balance IS NOT NULL THEN
      INSERT INTO credit_transactions (organization_id, type, amount, balance_after, description, reference_type, reference_id, idempotency_key)
        VALUES (j.organization_id, 'refund', -v_charge.amount, v_balance, 'Refund: job failed', 'job', j.id, 'job_refund_' || j.id);
    END IF;
  END IF;

  IF j.project_id IS NOT NULL THEN
    INSERT INTO alerts (organization_id, project_id, rule, type, severity, title, message, data)
      VALUES (j.organization_id, j.project_id, 'job_dead_letter', 'job_failed', 'high',
              'Job failed: ' || j.type,
              'Job ' || j.id || ' failed after ' || j.attempts || ' attempts (code: ' || p_code || ')',
              jsonb_build_object('jobId', j.id, 'jobType', j.type, 'errorCode', p_code))
      ON CONFLICT (organization_id, project_id, rule, type)
        WHERE read = false AND rule IN ('critical_issues','low_seo_score','job_dead_letter')
        DO NOTHING;
  END IF;
END $$;

-- ---------------------------------------------------------------- queue
CREATE OR REPLACE FUNCTION rf_worker_claim_jobs(p_limit INT, p_lease_seconds INT)
RETURNS TABLE (id UUID, organization_id UUID, project_id UUID, type VARCHAR, status VARCHAR, payload JSONB,
               attempts INT, max_attempts INT, created_at TIMESTAMPTZ, idempotency_key TEXT, execution_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE r RECORD;
BEGIN
  IF p_limit < 1 OR p_limit > 100 OR p_lease_seconds < 30 OR p_lease_seconds > 86400 THEN
    RAISE EXCEPTION 'rf_worker_claim_jobs: argument out of range' USING ERRCODE = '22023';
  END IF;

  -- Recover jobs whose worker died. Their old execution_id stops working immediately.
  FOR r IN
    SELECT j.id, j.attempts, j.max_attempts FROM jobs j
    WHERE j.status = 'running'
      AND COALESCE(j.lease_expires_at, j.started_at + INTERVAL '1 hour', NOW()) < NOW()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE job_attempts a SET status = 'failed', completed_at = NOW(),
           error = 'Worker lease expired', error_code = 'TIMEOUT'
      WHERE a.job_id = r.id AND a.attempt_number = r.attempts AND a.status = 'running';
    IF r.attempts >= r.max_attempts THEN
      PERFORM rf__dead_letter(r.id, 'Worker lease expired', 'TIMEOUT');
    ELSE
      UPDATE jobs j SET status = 'retrying', scheduled_at = NOW(), execution_id = gen_random_uuid(),
             error = 'Worker lease expired', error_code = 'TIMEOUT', lease_expires_at = NULL
        WHERE j.id = r.id;
    END IF;
  END LOOP;

  RETURN QUERY
  WITH claimed AS (
    SELECT j.id FROM jobs j
    WHERE j.status IN ('pending','retrying') AND (j.scheduled_at IS NULL OR j.scheduled_at <= NOW())
      AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = j.organization_id AND o.suspended_at IS NOT NULL)
    ORDER BY j.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ), updated AS (
    UPDATE jobs j SET status = 'running', started_at = NOW(), attempts = j.attempts + 1,
           execution_id = gen_random_uuid(), error = NULL, error_code = NULL,
           lease_expires_at = NOW() + make_interval(secs => p_lease_seconds)
    FROM claimed c WHERE j.id = c.id
    RETURNING j.*
  ), attempt AS (
    INSERT INTO job_attempts (job_id, attempt_number, status, started_at)
    SELECT u.id, u.attempts, 'running', NOW() FROM updated u
    ON CONFLICT (job_id, attempt_number) DO NOTHING
  )
  SELECT u.id, u.organization_id, u.project_id, u.type, u.status, u.payload,
         u.attempts, u.max_attempts, u.created_at, u.idempotency_key, u.execution_id
  FROM updated u;
END $$;

CREATE OR REPLACE FUNCTION rf_worker_complete_job(p_job_id UUID, p_execution_id UUID, p_result JSONB, p_duration_ms INT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_attempt INT;
BEGIN
  UPDATE jobs SET status = 'completed', completed_at = NOW(), result = p_result, failed_at = NULL,
         error = NULL, error_code = NULL, lease_expires_at = NULL
    WHERE id = p_job_id AND execution_id = p_execution_id AND status = 'running'
    RETURNING attempts INTO v_attempt;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  UPDATE job_attempts SET status = 'completed', completed_at = NOW(), duration_ms = p_duration_ms
    WHERE job_id = p_job_id AND attempt_number = v_attempt;
  RETURN TRUE;
END $$;

-- Returns the resulting status, or 'lost' when this execution no longer owns the job.
CREATE OR REPLACE FUNCTION rf_worker_fail_job(p_job_id UUID, p_execution_id UUID, p_message TEXT, p_code TEXT, p_retryable BOOLEAN, p_duration_ms INT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  j jobs%ROWTYPE;
  v_message TEXT := left(p_message, 2000);
BEGIN
  SELECT * INTO j FROM jobs
    WHERE id = p_job_id AND execution_id = p_execution_id AND status = 'running' FOR UPDATE;
  IF NOT FOUND THEN RETURN 'lost'; END IF;

  UPDATE job_attempts SET status = 'failed', completed_at = NOW(), duration_ms = p_duration_ms,
         error = v_message, error_code = p_code
    WHERE job_id = p_job_id AND attempt_number = j.attempts;

  IF NOT p_retryable OR j.attempts >= j.max_attempts THEN
    PERFORM rf__dead_letter(p_job_id, v_message, p_code);
    RETURN 'dead_letter';
  END IF;

  UPDATE jobs SET status = 'retrying', error = v_message, error_code = p_code, lease_expires_at = NULL,
         scheduled_at = NOW() + make_interval(secs => LEAST(power(2, j.attempts), 60))
    WHERE id = p_job_id;
  RETURN 'retrying';
END $$;

-- The price lives here, not in the caller, so a compromised Worker cannot drain a wallet.
CREATE OR REPLACE FUNCTION rf_worker_charge_job(p_job_id UUID, p_execution_id UUID) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  j jobs%ROWTYPE;
  v_price INT;
  v_balance INT;
  v_limit_key TEXT;
  v_limit BIGINT;
  v_used BIGINT;
BEGIN
  SELECT * INTO j FROM jobs WHERE id = p_job_id AND execution_id = p_execution_id AND status = 'running';
  IF NOT FOUND THEN RETURN 'lost'; END IF;

  -- Customer requests are checked by the API; schedules reach the queue without passing it.
  IF j.idempotency_key LIKE 'sched\_%' THEN
    v_limit_key := CASE j.type WHEN 'SITE_CRAWL' THEN 'crawledPages' WHEN 'RANK_CHECK' THEN 'rankChecks'
                               WHEN 'CONTENT_BRIEF' THEN 'aiOperations' WHEN 'AI_VISIBILITY_CHECK' THEN 'aiOperations' END;
    IF v_limit_key IS NOT NULL THEN
      SELECT (p.limits->>v_limit_key)::int INTO v_limit FROM organizations o JOIN plans p ON p.id = o.plan WHERE o.id = j.organization_id;
      SELECT CASE v_limit_key
        WHEN 'crawledPages' THEN (SELECT COALESCE(SUM(crawled_pages), 0) FROM crawl_runs WHERE organization_id = j.organization_id AND created_at >= date_trunc('month', NOW()))
        WHEN 'rankChecks' THEN (SELECT COUNT(*) FROM keyword_rankings WHERE organization_id = j.organization_id AND created_at >= date_trunc('month', NOW()))
        ELSE (SELECT COUNT(*) FROM ai_usage WHERE organization_id = j.organization_id AND created_at >= date_trunc('month', NOW())) END INTO v_used;
      IF v_limit IS NOT NULL AND v_limit >= 0 AND v_used >= v_limit THEN RETURN 'quota_exceeded'; END IF;
    END IF;
  END IF;

  v_price := CASE j.type WHEN 'SITE_CRAWL' THEN 5 ELSE 0 END;
  IF v_price = 0 THEN RETURN 'not_billable'; END IF;

  -- Wallet lock first: it serializes concurrent charges for the tenant.
  SELECT balance INTO v_balance FROM credit_wallets WHERE organization_id = j.organization_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'no_wallet'; END IF;
  IF EXISTS (SELECT 1 FROM credit_transactions WHERE idempotency_key = 'job_charge_' || j.id) THEN
    RETURN 'already_charged';
  END IF;
  IF v_balance < v_price THEN RETURN 'insufficient'; END IF;

  UPDATE credit_wallets SET balance = balance - v_price, total_consumed = total_consumed + v_price, updated_at = NOW()
    WHERE organization_id = j.organization_id RETURNING balance INTO v_balance;
  INSERT INTO credit_transactions (organization_id, type, amount, balance_after, description, reference_type, reference_id, idempotency_key)
    VALUES (j.organization_id, 'consumption', -v_price, v_balance, 'Site crawl', 'job', j.id, 'job_charge_' || j.id);
  RETURN 'charged';
END $$;

-- ---------------------------------------------------------------- scheduler
CREATE OR REPLACE FUNCTION rf_scheduler_due(p_limit INT)
RETURNS TABLE (id UUID, organization_id UUID, project_id UUID, type TEXT, cron_expression TEXT, timezone TEXT,
               config JSONB, next_run_at TIMESTAMPTZ, project_domain TEXT, project_normalized_domain TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, s.organization_id, s.project_id, s.type, s.cron_expression, s.timezone, s.config, s.next_run_at,
         p.domain::text, p.normalized_domain::text
  FROM scheduled_jobs s
  LEFT JOIN projects p ON p.id = s.project_id AND p.organization_id = s.organization_id AND p.deleted_at IS NULL
  WHERE s.enabled = true AND (s.next_run_at IS NULL OR s.next_run_at <= NOW())
  ORDER BY s.next_run_at ASC NULLS FIRST
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  FOR UPDATE OF s SKIP LOCKED;
$$;

-- p_next NULL parks the schedule. p_fired stamps last_run_at. Only a due row can change.
CREATE OR REPLACE FUNCTION rf_scheduler_advance(p_id UUID, p_next TIMESTAMPTZ, p_fired BOOLEAN) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE scheduled_jobs
     SET next_run_at = COALESCE(p_next, 'infinity'),
         last_run_at = CASE WHEN p_fired THEN NOW() ELSE last_run_at END,
         updated_at = NOW()
   WHERE id = p_id AND (next_run_at IS NULL OR next_run_at <= NOW());
$$;

-- The tenant, project and job type come from the schedule row, never from the caller.
CREATE OR REPLACE FUNCTION rf_scheduler_enqueue(p_id UUID, p_payload JSONB) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s scheduled_jobs%ROWTYPE;
  v_job UUID;
BEGIN
  SELECT * INTO s FROM scheduled_jobs WHERE id = p_id AND enabled = true AND next_run_at <= NOW();
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO jobs (organization_id, project_id, type, status, payload, attempts, max_attempts, idempotency_key)
    VALUES (s.organization_id, s.project_id, s.type, 'pending', p_payload, 0, 3,
            'sched_' || s.id || '_' || extract(epoch FROM s.next_run_at)::bigint)
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_job;
  RETURN v_job;
END $$;

-- ---------------------------------------------------------------- function privileges
DO $$
DECLARE f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname FROM pg_proc p
    WHERE p.pronamespace = current_schema()::regnamespace
      AND (p.proname LIKE 'rf\_worker\_%' OR p.proname LIKE 'rf\_scheduler\_%' OR p.proname = 'rf__dead_letter')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    IF f.proname <> 'rf__dead_letter' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO rankforge_worker', f.sig);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------- restrictive tenant policy
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables i ON i.table_schema = c.table_schema AND i.table_name = c.table_name
    WHERE c.table_schema = current_schema() AND c.column_name = 'organization_id'
      AND i.table_type = 'BASE TABLE' AND c.table_name <> 'rf_worker_bindings'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
    EXECUTE format('DROP POLICY IF EXISTS rf_worker_lease_guard ON %I', t.table_name);
    EXECUTE format('CREATE POLICY rf_worker_lease_guard ON %I AS RESTRICTIVE FOR ALL TO rankforge_worker
                    USING (organization_id = (SELECT rf_worker_current_org()))
                    WITH CHECK (organization_id = (SELECT rf_worker_current_org()))', t.table_name);
  END LOOP;
END $$;

-- ---------------------------------------------------------------- table privileges
-- Derived from the SQL in apps/worker/src. Queue, wallet, ledger, attempts and schedules
-- are reachable only through the functions above. See docs/WORKER-PERMISSIONS.md.
GRANT SELECT (id, organization_id, name, domain, normalized_domain, country, language, device, seo_score, competitors, deleted_at),
      UPDATE (seo_score, last_crawl_at, updated_at) ON projects TO rankforge_worker;
GRANT SELECT (id, organization_id, project_id, status, crawled_pages, total_pages, created_at, config), INSERT,
      UPDATE (status, started_at, config, total_pages, crawled_pages, failed_pages, completed_at) ON crawl_runs TO rankforge_worker;
GRANT SELECT (crawl_run_id, organization_id, url, normalized_url, status_code, content_type, title, meta_description, h1, word_count, response_time_ms, canonical_url, robots_directive, is_noindex, headers, links, images, structured_data), INSERT,
      UPDATE (status_code, title, meta_description, h1, word_count, response_time_ms) ON crawl_pages TO rankforge_worker;
GRANT SELECT (crawl_run_id, organization_id), INSERT, DELETE ON crawl_issues TO rankforge_worker;
GRANT SELECT (crawl_run_id, organization_id, project_id, rule_id, severity, category, title, affected_urls, status), INSERT, DELETE ON audit_findings TO rankforge_worker;
GRANT SELECT (id, organization_id, project_id, keyword, term, normalized_keyword, normalized_term, current_position, search_volume, volume, difficulty, created_at),
      UPDATE (previous_position, current_position, last_checked_at, provider, updated_at, volume, search_volume, cpc, competition, difficulty) ON keywords TO rankforge_worker;
GRANT SELECT (organization_id, keyword_id, date, search_engine, country, device, position, previous_position, url, provider, raw_data), INSERT,
      UPDATE (position, previous_position, url, provider, raw_data) ON keyword_rankings TO rankforge_worker;
-- Table-level SELECT: RETURNING (xmax = 0) reads a system column, which column grants cannot
-- cover. These two tables hold no credentials, and the restrictive policy still applies.
GRANT SELECT, INSERT,
      UPDATE (last_seen_at, status, anchor_text, domain_rating, is_nofollow, provider, evidence) ON backlinks TO rankforge_worker;
GRANT SELECT, INSERT,
      UPDATE (shared_keywords, evidence, last_analyzed_at) ON competitors TO rankforge_worker;
GRANT SELECT (organization_id, project_id, date, query, page, country, device, clicks, impressions, ctr, position, raw_data), INSERT,
      UPDATE (clicks, impressions, ctr, position, raw_data) ON gsc_metrics TO rankforge_worker;
GRANT SELECT (organization_id, project_id, date, channel, users, sessions, page_views, organic_users, conversions, raw_data), INSERT,
      UPDATE (users, sessions, page_views, organic_users, conversions, raw_data) ON ga4_metrics TO rankforge_worker;
GRANT INSERT ON pagespeed_results TO rankforge_worker;
GRANT SELECT (id, organization_id), INSERT ON geo_runs TO rankforge_worker;
GRANT SELECT (id, organization_id, project_id, title, target_keyword, content_type, target_word_count, word_count),
      UPDATE (status, outline, provider, model, prompt_version, updated_at) ON content_briefs TO rankforge_worker;
GRANT SELECT (organization_id, idempotency_key), INSERT ON ai_usage TO rankforge_worker;
GRANT SELECT (id, organization_id, project_id), INSERT, UPDATE (status, data_snapshot, completed_at) ON reports TO rankforge_worker;
GRANT SELECT (id, organization_id, project_id, rule, type, read), INSERT ON alerts TO rankforge_worker;
GRANT SELECT (id, organization_id, project_id, provider, status, credentials_encrypted, config),
      UPDATE (status, credentials_encrypted, last_error, last_sync_at, updated_at) ON integrations TO rankforge_worker;
