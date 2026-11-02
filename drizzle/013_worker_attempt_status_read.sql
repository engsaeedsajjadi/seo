-- RankForge 013: minimum SELECT privilege for job attempt status.
GRANT SELECT (status)
ON public.job_attempts
TO rankforge_worker;