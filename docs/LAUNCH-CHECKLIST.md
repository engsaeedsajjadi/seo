# Launch checklist

What must be true before taking payment. "Verified" means a test in this repository runs it.

## Must be done by the operator (cannot be verified from the repository)

- [ ] `docker compose up --build` works on the target host, and `npm run test:e2e:browser` passes against it.
- [ ] A TLS reverse proxy serves the public domain. Set `TRUST_PROXY_HOPS` to the number of proxies in front of the API.
- [ ] Network rules stop the Worker reaching private ranges and cloud metadata (closes the DNS rebinding gap).
- [ ] Real keys tested in staging: DataForSEO, Google OAuth, an AI provider, PageSpeed, SMTP.
- [ ] Zarinpal merchant approved for the production domain, and a real payment and refund tested with `ZARINPAL_MERCHANT_ID`. Sandbox first with `ZARINPAL_SANDBOX=true`.
- [ ] Toman prices reviewed in the platform panel. The seeded prices are placeholders.
- [ ] Data sources chosen from `docs/IRAN-DATA-SOURCES.md`. DataForSEO's terms exclude Iran. Check OpenAI and Google access and terms from the production setup too.
- [ ] `PLATFORM_ADMIN_EMAILS`, `METRICS_TOKEN`, `WORKER_DATABASE_PASSWORD` and `API_DATABASE_PASSWORD` set to real values.
- [ ] Daily `scripts/ops/backup.sh` scheduled, copied off the host, and one restore rehearsed.
- [ ] Alerts on `rankforge_queue_oldest_job_age_seconds` and on `rankforge_jobs{status="dead_letter"}`.
- [ ] Terms of service, privacy policy and a support channel published.

## Verified by tests

| Area | Suite |
|---|---|
| Worker tenant isolation, permissions, retries, credits, scheduler | `npm run test:worker` |
| Customer journey, RLS safety net, email protocol, webhooks, platform admin | `tests/integration/saas-journey.test.ts` |
| Every page in a real browser on desktop and phone, under the production CSP | `tests/e2e/ui-walkthrough.spec.ts` |

Providers in these suites are mocked and SMTP is a local stub. They prove our handling, not the providers.
