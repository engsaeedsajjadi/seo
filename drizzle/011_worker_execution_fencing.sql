-- RankForge 011: minimum privilege for execution fencing.
GRANT SELECT (execution_id)
ON public.jobs TO rankforge_worker;