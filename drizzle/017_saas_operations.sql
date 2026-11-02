-- Migration 017: email verification, webhook delivery, owner notifications and scheduled quotas.

-- Accounts that already exist were created without verification; they are not locked out.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_verification_user ON email_verification_tokens(user_id);
UPDATE users SET email_verified = true WHERE email_verified IS DISTINCT FROM true
  AND NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '017_saas_operations.sql');
GRANT SELECT, INSERT, UPDATE, DELETE ON email_verification_tokens TO rankforge_api_system;

-- Who to tell when something needs attention. The Worker cannot read users directly.
CREATE OR REPLACE FUNCTION rf_worker_owner_contact(p_job_id UUID, p_execution_id UUID)
RETURNS TABLE (email TEXT, name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.email::text, u.name::text
  FROM jobs j
  JOIN organizations o ON o.id = j.organization_id
  JOIN users u ON u.id = o.owner_id AND u.deleted_at IS NULL
  WHERE j.id = p_job_id AND j.execution_id = p_execution_id;
$$;

-- Queues one delivery job per subscribed webhook. Works after a job has finished, so a
-- failed job can still announce itself; the execution_id proves the caller ran that job.
CREATE OR REPLACE FUNCTION rf_worker_emit_event(p_job_id UUID, p_execution_id UUID, p_event TEXT, p_data JSONB)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  j jobs%ROWTYPE;
  w RECORD;
  v_delivery UUID;
  v_count INT := 0;
BEGIN
  SELECT * INTO j FROM jobs WHERE id = p_job_id AND execution_id = p_execution_id;
  IF NOT FOUND OR j.type = 'WEBHOOK_DELIVERY' THEN RETURN 0; END IF;
  FOR w IN
    SELECT id FROM webhooks
    WHERE organization_id = j.organization_id AND active = true AND status = 'active'
      AND events ? p_event
  LOOP
    INSERT INTO webhook_deliveries (webhook_id, event, status, payload)
      VALUES (w.id, p_event, 'pending', jsonb_build_object(
        'event', p_event, 'timestamp', NOW(), 'organizationId', j.organization_id, 'projectId', j.project_id, 'data', p_data))
      RETURNING id INTO v_delivery;
    INSERT INTO jobs (organization_id, type, payload, max_attempts, idempotency_key)
      VALUES (j.organization_id, 'WEBHOOK_DELIVERY', jsonb_build_object('deliveryId', v_delivery), 5, 'webhook_' || v_delivery);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION rf_worker_delivery_get(p_job_id UUID, p_execution_id UUID)
RETURNS TABLE (id UUID, url TEXT, secret_hash TEXT, event TEXT, payload JSONB)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT d.id, w.url, w.secret_hash, d.event::text, d.payload
  FROM jobs j
  JOIN webhook_deliveries d ON d.id = (j.payload->>'deliveryId')::uuid
  JOIN webhooks w ON w.id = d.webhook_id AND w.organization_id = j.organization_id
  WHERE j.id = p_job_id AND j.execution_id = p_execution_id AND j.status = 'running' AND j.type = 'WEBHOOK_DELIVERY';
$$;

CREATE OR REPLACE FUNCTION rf_worker_delivery_result(p_job_id UUID, p_execution_id UUID, p_response_code INT, p_delivered BOOLEAN)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE webhook_deliveries d
     SET status = CASE WHEN p_delivered THEN 'delivered' WHEN j.attempts >= j.max_attempts THEN 'failed' ELSE 'retrying' END,
         response_code = p_response_code, response_status = p_response_code, attempts = j.attempts,
         delivered_at = CASE WHEN p_delivered THEN NOW() ELSE d.delivered_at END
    FROM jobs j
   WHERE j.id = p_job_id AND j.execution_id = p_execution_id AND j.type = 'WEBHOOK_DELIVERY'
     AND d.id = (j.payload->>'deliveryId')::uuid;
  UPDATE webhooks w SET last_triggered_at = NOW()
    FROM jobs j JOIN webhook_deliveries d ON d.id = (j.payload->>'deliveryId')::uuid
   WHERE j.id = p_job_id AND j.execution_id = p_execution_id AND w.id = d.webhook_id;
$$;

DO $$
DECLARE f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
    WHERE p.pronamespace = current_schema()::regnamespace
      AND p.proname IN ('rf_worker_owner_contact','rf_worker_emit_event','rf_worker_delivery_get','rf_worker_delivery_result')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO rankforge_worker', f.sig);
  END LOOP;
END $$;
