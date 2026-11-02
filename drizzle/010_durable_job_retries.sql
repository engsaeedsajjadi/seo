-- RankForge 010: persistent database-backed job retries.

ALTER POLICY queue_claim_update
ON public.jobs
USING (status IN ('pending', 'retrying'))
WITH CHECK (status = 'running');

ALTER POLICY queue_claim_update_guard
ON public.jobs
USING (status IN ('pending', 'retrying'))
WITH CHECK (status = 'running');

CREATE OR REPLACE FUNCTION public.claim_jobs(p_limit integer)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  project_id uuid,
  type varchar,
  status varchar,
  payload jsonb,
  attempts integer,
  max_attempts integer,
  created_at timestamptz,
  idempotency_key text,
  execution_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 20 THEN
    RAISE EXCEPTION 'Invalid claim limit'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT j.id
    FROM public.jobs AS j
    WHERE j.status IN ('pending', 'retrying')
      AND (j.scheduled_at IS NULL OR j.scheduled_at <= NOW())
    ORDER BY j.created_at ASC, j.id ASC
    FOR UPDATE OF j SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.jobs AS j
  SET status = 'running',
      started_at = NOW(),
      attempts = COALESCE(j.attempts, 0) + 1,
      execution_id = gen_random_uuid(),
      error = NULL,
      error_code = NULL
  FROM candidates AS c
  WHERE j.id = c.id
  RETURNING
    j.id, j.organization_id, j.project_id,
    j.type, j.status, j.payload, j.attempts,
    j.max_attempts, j.created_at,
    j.idempotency_key, j.execution_id;
END;
$function$;