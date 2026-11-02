-- Migration 019: rank history computed from Search Console, for markets with no paid SERP provider.
-- The Worker reads the columns it aggregates; everything else on these tables stays closed.
GRANT SELECT (organization_id, project_id, query, page, impressions, position, clicks, date) ON gsc_metrics TO rankforge_worker;
GRANT SELECT (organization_id, project_id, keyword_id, provider) ON keyword_rankings TO rankforge_worker;
GRANT SELECT (id, organization_id, project_id, keyword, term, current_position) ON keywords TO rankforge_worker;
GRANT UPDATE (previous_position, current_position, last_checked_at, updated_at) ON keywords TO rankforge_worker;
