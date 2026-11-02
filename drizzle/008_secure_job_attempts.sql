-- RankForge 008: strict tenant RLS for job attempts.
-- Never allow empty or missing tenant context.

ALTER TABLE public.job_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_attempts_isolation ON public.job_attempts;
DROP POLICY IF EXISTS job_attempts_tenant_access ON public.job_attempts;
DROP POLICY IF EXISTS job_attempts_tenant_guard ON public.job_attempts;

CREATE POLICY job_attempts_tenant_access
ON public.job_attempts
AS PERMISSIVE FOR ALL TO PUBLIC
USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_attempts.job_id
      AND j.organization_id =
        NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_attempts.job_id
      AND j.organization_id =
        NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  )
);

CREATE POLICY job_attempts_tenant_guard
ON public.job_attempts
AS RESTRICTIVE FOR ALL TO PUBLIC
USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_attempts.job_id
      AND j.organization_id =
        NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_attempts.job_id
      AND j.organization_id =
        NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  )
);

GRANT SELECT (id, organization_id)
ON public.jobs TO rankforge_worker;

GRANT INSERT (job_id, attempt_number, status, started_at)
ON public.job_attempts TO rankforge_worker;

GRANT SELECT (job_id, attempt_number)
ON public.job_attempts TO rankforge_worker;

GRANT UPDATE (status, completed_at, duration_ms, error, error_code)
ON public.job_attempts TO rankforge_worker;