# RankForge — Worker Documentation

## Overview
Separate worker application that consumes jobs, retries failures, handles dead-letters, ensures idempotency, concurrency limits, provider rate limiting, structured logging.

## Job Types
- SITE_CRAWL
- RANK_CHECK
- KEYWORD_REFRESH
- BACKLINK_REFRESH
- GSC_SYNC
- GA4_SYNC
- PAGESPEED_CHECK
- COMPETITOR_CHECK
- AI_VISIBILITY_CHECK
- REPORT_GENERATION
- ALERT_PROCESSING

## Architecture

```
HTTP Request → Create Job Record (DB) → Queue → Worker
                                                  │
                                        ┌─────────┴─────────┐
                                        │  Job Execution     │
                                        │  ├─ Retry Logic    │
                                        │  ├─ Rate Limiting  │
                                        │  ├─ Idempotency    │
                                        │  ├─ Timeout (5min) │
                                        │  └─ Dead Letter    │
                                        └───────────────────┘
                                                  │
                                        Store Result → Notify
```

## Implementation

### Queue
- Primary: pg-boss (PostgreSQL-native) — recommended
- Fallback: In-memory queue for dev without DB/Redis
- Alternative: BullMQ + Redis if Redis available

### Worker Loop
```ts
while (running) {
  const pendingJobs = getPendingJobs().slice(0, concurrency);
  for (const job of pendingJobs) {
    processJob(job); // async, with timeout
  }
  sleep(1000);
}
```

### Job Execution
- Set status to running, increment attempts
- Race between work and timeout (5min default)
- On success: status completed, result stored, completedAt set
- On failure: if attempts < maxAttempts, schedule retry with exponential backoff (2^attempt * 1000ms), else dead-letter
- Dead-letter: log, create alert, notify admins

### Idempotency
- Jobs have unique ID
- If same job type + same payload + recent → return existing result
- Prevents duplicate crawls, rank checks

### Concurrency Limits
- Worker concurrency: 5 default (env WORKER_CONCURRENCY)
- Crawler concurrency: 10 max, 5 default
- Provider rate limiting: DataForSEO, SerpApi, AI providers all rate-limited

### Provider Rate Limiting
- Track requests per provider per minute
- If rate limited, backoff and retry
- Circuit breaker after repeated failures

### Structured Logging
- Every job logs: jobId, type, orgId, projectId, attempt, duration, status
- Request ID correlation
- No secrets logged

### Error Handling
- Never allow one failed job to crash entire worker
- Try/catch around each job
- Dead-letter queue for permanently failed jobs
- Alerts created for failed jobs

### Scheduling
- Cron-based: hourly, daily, weekly, monthly, custom cron
- Timezone-aware (project timezone)
- Stored in report_schedules, notification_rules

### Example Job Handlers
- SITE_CRAWL: Uses Crawler class, runs audit, calculates score, deducts credits
- RANK_CHECK: Uses SearchProvider, checks positions, stores rankings
- KEYWORD_REFRESH: Refreshes keyword data via provider
- BACKLINK_REFRESH: Refreshes backlinks
- GSC_SYNC: OAuth token refresh, fetch metrics
- GA4_SYNC: Similar
- PAGESPEED_CHECK: Calls PageSpeed API
- AI_VISIBILITY_CHECK: Calls AI providers
- REPORT_GENERATION: Generates PDF/HTML/CSV/JSON
- ALERT_PROCESSING: Evaluates rules, sends notifications

## Deployment

### Docker
- Separate service `worker` in docker-compose.yml
- Same image as api, different command
- Depends on postgres, api

### Scaling
- Scale worker replicas by queue depth
- Each worker respects concurrency limits
- No shared state, stateless

### Monitoring
- Queue depth metric
- Failed jobs metric
- Job duration histogram
- Provider failure rate
- Worker heartbeat

## Testing

- Job creation via API
- Worker picks up job
- Retry logic
- Dead-letter handling
- Idempotency
- Concurrency
- Timeout
