-- RankForge 005: secure queue-claim roles, grants, RLS and function.
-- Scheduler access will be handled by a separate migration.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rankforge_runtime') THEN
    CREATE ROLE rankforge_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rankforge_api') THEN
    CREATE ROLE rankforge_api NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rankforge_worker') THEN
    CREATE ROLE rankforge_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rankforge_queue_executor') THEN
    CREATE ROLE rankforge_queue_executor NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$roles$;

GRANT rankforge_runtime TO rankforge_api, rankforge_worker;
GRANT USAGE ON SCHEMA public TO rankforge_runtime, rankforge_worker, rankforge_queue_executor;

GRANT SELECT (
  id, organization_id, project_id, type, status, payload,
  attempts, max_attempts, scheduled_at, created_at,
  idempotency_key, execution_id
) ON public.jobs TO rankforge_queue_executor;

GRANT UPDATE (
  status, started_at, attempts, execution_id, error, error_code
) ON public.jobs TO rankforge_queue_executor;

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS queue_claim_select ON public.jobs;
CREATE POLICY queue_claim_select ON public.jobs
  FOR SELECT TO rankforge_queue_executor USING (true);

DROP POLICY IF EXISTS queue_claim_update ON public.jobs;
CREATE POLICY queue_claim_update ON public.jobs
  FOR UPDATE TO rankforge_queue_executor
  USING (status = 'pending') WITH CHECK (status = 'running');

DROP POLICY IF EXISTS queue_claim_update_guard ON public.jobs;
CREATE POLICY queue_claim_update_guard ON public.jobs
  AS RESTRICTIVE FOR UPDATE TO rankforge_queue_executor
  USING (status = 'pending') WITH CHECK (status = 'running');

CREATE OR REPLACE FUNCTION public.claim_jobs(p_limit integer)
 RETURNS TABLE(id uuid, organization_id uuid, project_id uuid, type character varying, status character varying, payload jsonb, attempts integer, max_attempts integer, created_at timestamp with time zone, idempotency_key text, execution_id uuid)
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
        WHERE j.status = 'pending'
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

ALTER FUNCTION public.claim_jobs(integer) OWNER TO rankforge_queue_executor;
REVOKE ALL ON FUNCTION public.claim_jobs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_jobs(integer) TO rankforge_worker;