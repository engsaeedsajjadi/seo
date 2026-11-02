-- RankForge 007: minimum scheduler privileges for tenant-scoped Worker.
-- No BYPASSRLS, no broad table-level grants.

GRANT USAGE ON SCHEMA public TO rankforge_worker;

GRANT SELECT (
  id, organization_id, project_id, type,
  cron_expression, timezone, config,
  enabled, next_run_at
)
ON public.scheduled_jobs TO rankforge_worker;

GRANT UPDATE (
  next_run_at, last_run_at, updated_at
)
ON public.scheduled_jobs TO rankforge_worker;

GRANT SELECT (
  id, organization_id, domain,
  normalized_domain, deleted_at
)
ON public.projects TO rankforge_worker;

GRANT INSERT (
  organization_id, project_id, type,
  status, payload, attempts, max_attempts,
  scheduled_at, idempotency_key, execution_id
)
ON public.jobs TO rankforge_worker;

GRANT SELECT (id, idempotency_key) ON public.jobs TO rankforge_worker;