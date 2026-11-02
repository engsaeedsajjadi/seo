-- RankForge 009: restricted Worker job transitions.

GRANT SELECT (
  status,
  attempts,
  max_attempts
) ON public.jobs TO rankforge_worker;

GRANT UPDATE (
  status,
  completed_at,
  result,
  failed_at,
  error,
  error_code,
  scheduled_at
) ON public.jobs TO rankforge_worker;

-- Existing tenant_isolation remains in force.
-- Worker can finalize only a running job belonging
-- to the current tenant.

DROP POLICY IF EXISTS worker_job_transition_guard
ON public.jobs;

CREATE POLICY worker_job_transition_guard
ON public.jobs
AS RESTRICTIVE
FOR UPDATE
TO rankforge_worker
USING (
  organization_id =
    NULLIF(
      current_setting('app.current_organization_id', true),
      ''
    )::uuid
  AND status = 'running'
)
WITH CHECK (
  organization_id =
    NULLIF(
      current_setting('app.current_organization_id', true),
      ''
    )::uuid
  AND status IN (
    'completed',
    'retrying',
    'dead_letter'
  )
);