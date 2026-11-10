-- Migration 025: a failed article (CONTENT_DRAFT) job must not mark the brief itself as failed.
--
-- rf__dead_letter set content_briefs.status = 'failed' for every job that carried a briefId. After
-- one failed article attempt the outline was still there but the brief could never be used again.

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
  -- Only a failed outline job fails the brief. A failed article job leaves the outline usable,
  -- so the article can be requested again.
  IF j.payload ? 'briefId' AND j.type = 'CONTENT_BRIEF' THEN
    UPDATE content_briefs SET status = 'failed', updated_at = NOW()
      WHERE id = (j.payload->>'briefId')::uuid AND organization_id = j.organization_id;
  END IF;
  IF j.payload ? 'briefId' AND j.type = 'CONTENT_DRAFT' THEN
    UPDATE content_briefs SET draft_status = 'failed', draft_error = COALESCE(draft_error, left(p_message, 500)), draft_updated_at = NOW()
      WHERE id = (j.payload->>'briefId')::uuid AND organization_id = j.organization_id AND draft_status = 'writing';
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

-- Briefs that were wrongly failed this way still have their outline: make them usable again.
UPDATE content_briefs SET status = 'completed', updated_at = NOW()
  WHERE status = 'failed' AND jsonb_typeof(outline->'sections') = 'array' AND jsonb_array_length(outline->'sections') > 0;
