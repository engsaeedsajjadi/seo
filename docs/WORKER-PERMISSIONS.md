# Worker permission matrix

Source of truth: `drizzle/015_worker_lease_bound_tenancy.sql`, derived from the SQL in `apps/worker/src`.
`tests/integration/worker-real.test.ts` runs every handler below as a restricted login.

Every table access happens in a transaction bound to the running job (`rf_worker_bind_job`). A restrictive
policy limits each row to that job's organization, and the binding stops working as soon as the execution no
longer owns the job.

| Job type | Reads | Writes | DELETE | UPSERT | External service | Credit | Idempotent |
|---|---|---|---|---|---|---|---|
| SITE_CRAWL | crawl_runs | crawl_runs, crawl_pages, audit_findings, crawl_issues, projects, alerts | findings and issues of the same run | crawl_pages | target website | 5, refunded on dead letter | yes: run reused, findings rebuilt, one charge per job |
| SEO_AUDIT, AUDIT | crawl_runs, crawl_pages, projects | audit_findings, projects | findings of the same run | no | no | no | yes: rebuilt atomically |
| RANK_CHECK | projects, keywords | keyword_rankings, keywords | no | keyword_rankings | DataForSEO | no | yes: one row per keyword/day/engine/country/device |
| KEYWORD_REFRESH | projects, keywords | keywords | no | no | DataForSEO | no | yes: overwrites metrics |
| BACKLINK_SYNC, BACKLINK_REFRESH | projects | backlinks | no | backlinks | DataForSEO | no | yes |
| COMPETITOR_CHECK | projects | competitors | no | competitors | DataForSEO (optional) | no | yes |
| GSC_SYNC | integrations | gsc_metrics, integrations | no | gsc_metrics | Google | no | yes |
| GA4_SYNC | integrations | ga4_metrics, integrations | no | ga4_metrics | Google | no | yes |
| PAGESPEED_CHECK | none | pagespeed_results | no | no | Google PageSpeed | no | no: each run adds a result |
| AI_VISIBILITY_CHECK | projects, competitors | geo_runs, ai_usage | no | ai_usage (`DO NOTHING`) | AI provider | no | usage yes; a re-run calls the provider again |
| CONTENT_BRIEF | content_briefs, projects | content_briefs, ai_usage | no | ai_usage (`DO NOTHING`) | AI provider | no | usage yes; a re-run calls the provider again |
| REPORT_GENERATION | projects, crawl_runs, audit_findings, keywords | reports | no | no | no | no | with `reportId` yes; without it each run adds a report |
| ALERT_EVALUATION, ALERT_PROCESSING | projects, audit_findings, crawl_runs | alerts | no | alerts (`DO NOTHING`) | no | no | yes: one unread alert per project and rule |

## Reachable only through definer functions

The Worker role has no table privilege on `jobs`, `job_attempts`, `credit_wallets`, `credit_transactions`,
`scheduled_jobs` or `rf_worker_bindings`.

| Function | Purpose |
|---|---|
| `rf_worker_claim_jobs` | Atomic claim, attempt record, recovery of expired leases |
| `rf_worker_bind_job` | Binds this transaction to a job it owns |
| `rf_worker_complete_job`, `rf_worker_fail_job` | Fenced by `execution_id` |
| `rf_worker_charge_job` | Charges a price fixed in the database, once per job |
| `rf_scheduler_due`, `rf_scheduler_advance`, `rf_scheduler_enqueue` | Scheduler, only for schedules that are due |

## Known limits

- A compromised Worker can claim queued jobs and so reach those tenants while the job runs. Tenants with no queued job stay closed.
- A compromised Worker holds the decryption key for stored OAuth tokens, so `credentials_encrypted` protects against database leaks, not against the Worker itself.
- The API still connects as the database owner, which bypasses RLS. See the readiness report.
