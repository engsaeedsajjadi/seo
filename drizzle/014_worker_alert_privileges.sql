-- RankForge 014: minimum privileges for alert processing.

GRANT SELECT (seo_score)
ON public.projects
TO rankforge_worker;

GRANT SELECT (project_id, severity, status)
ON public.audit_findings
TO rankforge_worker;

GRANT INSERT (
    organization_id,
    project_id,
    rule,
    type,
    message,
    title,
    severity,
    data,
    triggered_at
)
ON public.alerts
TO rankforge_worker;

-- Needed by INSERT ... ON CONFLICT (...) DO NOTHING.
GRANT SELECT (
    organization_id,
    project_id,
    rule,
    type,
    triggered_at
)
ON public.alerts
TO rankforge_worker;