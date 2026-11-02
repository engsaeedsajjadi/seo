-- RankForge 006: restricted cross-tenant scheduler discovery.
-- Tenant-specific processing will use separate RLS-scoped transactions.

DO $roles$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'rankforge_scheduler_locator'
  ) THEN
    CREATE ROLE rankforge_scheduler_locator
      NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
  END IF;
END
$roles$;

GRANT USAGE ON SCHEMA public TO rankforge_scheduler_locator;

GRANT SELECT (organization_id, enabled, next_run_at)
ON public.scheduled_jobs TO rankforge_scheduler_locator;

ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduler_discovery_select ON public.scheduled_jobs;

CREATE POLICY scheduler_discovery_select
ON public.scheduled_jobs
AS PERMISSIVE FOR SELECT
TO rankforge_scheduler_locator
USING (
  enabled IS TRUE
  AND (next_run_at IS NULL OR next_run_at <= NOW())
);

CREATE OR REPLACE FUNCTION public.discover_due_schedule_tenants(
  p_limit integer
)
RETURNS TABLE(organization_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'Invalid scheduler discovery limit'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT DISTINCT s.organization_id
  FROM public.scheduled_jobs AS s
  WHERE s.enabled IS TRUE
    AND (s.next_run_at IS NULL OR s.next_run_at <= NOW())
  ORDER BY s.organization_id
  LIMIT p_limit;
END;
$function$;

ALTER FUNCTION public.discover_due_schedule_tenants(integer)
OWNER TO rankforge_scheduler_locator;

REVOKE ALL ON FUNCTION public.discover_due_schedule_tenants(integer)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.discover_due_schedule_tenants(integer)
TO rankforge_worker;