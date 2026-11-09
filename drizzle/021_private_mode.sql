-- Migration 021: private (agency) mode.
--
-- The app can run for one business that sells SEO services to its own customers instead of
-- selling subscriptions. That deployment has no paid plans and no public sign-up: the owner
-- invites staff. SEOYAR_MODE=private moves every organization to the PRIVATE plan (migrate.ts).

-- A plan without commercial limits. Only caps that guard against a costly mistake remain:
-- AI calls per month (Gemini quota) and crawl depth; pages per crawl stay capped by the API.
INSERT INTO plans (id, name, description, price_monthly_cents, price_annual_cents, limits, features, is_active, monthly_credits)
VALUES ('PRIVATE', 'Private', 'Single business use, no subscription', 0, 0,
  '{"projects": -1, "keywords": -1, "crawledPages": -1, "rankChecks": -1, "aiOperations": 1000, "reports": -1, "users": -1, "apiRequests": -1, "competitors": -1, "backlinks": -1, "crawlDepth": 10, "historyMonths": 36}',
  '[]', false, 0)
ON CONFLICT (id) DO UPDATE SET limits = EXCLUDED.limits, description = EXCLUDED.description;

DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'organizations'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%plan%'
  LOOP
    EXECUTE format('ALTER TABLE organizations DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE organizations ADD CONSTRAINT organizations_plan_check
  CHECK (plan IN ('FREE', 'STARTER', 'PRO', 'AGENCY', 'ENTERPRISE', 'PRIVATE'));

-- Invitations to join an organization. The token is sent once; only its hash is kept.
CREATE TABLE IF NOT EXISTS organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK (length(email) <= 320),
  role TEXT NOT NULL CHECK (role IN ('Admin', 'Manager', 'SEO_Manager', 'Analyst', 'Editor', 'Client', 'Viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_open
  ON organization_invitations (organization_id, lower(email)) WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON organization_invitations;
CREATE POLICY tenant_isolation ON organization_invitations FOR ALL
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
-- The tenant role manages its own invitations; accepting one happens before there is a tenant.
GRANT SELECT, INSERT, UPDATE ON organization_invitations TO rankforge_api;
GRANT SELECT, INSERT, UPDATE ON organization_invitations TO rankforge_api_system;

-- Crawls of a PRIVATE organization are not charged to the credit wallet.
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
  IF EXISTS (SELECT 1 FROM organizations WHERE id = j.organization_id AND plan = 'PRIVATE') THEN RETURN 'not_billable'; END IF;

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
