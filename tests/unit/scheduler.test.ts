/**
 * RankForge — Scheduler runner: unit tests
 * Proves, with pure functions only (no DB, no HTTP):
 *  - cron parsing (lists, ranges, steps, Sunday 0/7, invalid input)
 *  - next-run computation incl. timezone conversion and DST
 *  - standard cron day-of-month/day-of-week OR semantics
 *  - scheduled-job payload construction (mirrors API payloads, honest skips)
 */

import assert from 'assert';
import {
  parseCronExpression,
  computeNextRun,
  buildScheduledJobPayload,
} from '../../apps/worker/src/scheduler.js';

console.log('Testing scheduler cron + payload logic...');

const iso = (d: Date | null) => (d ? d.toISOString() : null);

// ---------- Parsing ----------
{
  const spec = parseCronExpression('*/15 9-17 1,15 * 1-5');
  assert.deepStrictEqual([...spec.minutes].sort((a, b) => a - b), [0, 15, 30, 45]);
  assert.deepStrictEqual([...spec.hours].sort((a, b) => a - b), [9, 10, 11, 12, 13, 14, 15, 16, 17]);
  assert.deepStrictEqual([...(spec.dom || [])].sort((a, b) => a - b), [1, 15]);
  assert.deepStrictEqual([...(spec.dow || [])].sort((a, b) => a - b), [1, 2, 3, 4, 5]);

  const star = parseCronExpression('* * * * *');
  assert.strictEqual(star.dom, null, 'unrestricted dom must be null');
  assert.strictEqual(star.dow, null, 'unrestricted dow must be null');
  assert.strictEqual(star.minutes.size, 60);

  const sun7 = parseCronExpression('0 0 * * 7');
  assert.deepStrictEqual([...(sun7.dow || [])], [0], 'dow 7 normalizes to Sunday 0');

  assert.throws(() => parseCronExpression('61 * * * *'), /out of range/);
  assert.throws(() => parseCronExpression('* * * *'), /5 fields/);
  assert.throws(() => parseCronExpression('x * * * *'), /Invalid cron/);
  assert.throws(() => parseCronExpression('*/0 * * * *'), /step/);
  console.log('  ✓ cron parsing');
}

// ---------- Next run: basics in UTC ----------
{
  // Every minute from a mid-minute instant → next minute boundary
  assert.strictEqual(iso(computeNextRun('* * * * *', 'UTC', new Date('2026-01-15T10:20:30Z'))), '2026-01-15T10:21:00.000Z');
  // Strictly after: exactly on a boundary moves to the NEXT slot
  assert.strictEqual(iso(computeNextRun('* * * * *', 'UTC', new Date('2026-01-15T10:20:00Z'))), '2026-01-15T10:21:00.000Z');
  // Daily 09:30 — before → same day; after → next day
  assert.strictEqual(iso(computeNextRun('30 9 * * *', 'UTC', new Date('2026-01-15T09:00:00Z'))), '2026-01-15T09:30:00.000Z');
  assert.strictEqual(iso(computeNextRun('30 9 * * *', 'UTC', new Date('2026-01-15T09:30:00Z'))), '2026-01-16T09:30:00.000Z');
  // Weekly: Monday 00:00. 2026-01-15 is a Thursday → next is Mon 2026-01-19
  assert.strictEqual(iso(computeNextRun('0 0 * * 1', 'UTC', new Date('2026-01-15T12:00:00Z'))), '2026-01-19T00:00:00.000Z');
  // Monthly: 1st at 06:00
  assert.strictEqual(iso(computeNextRun('0 6 1 * *', 'UTC', new Date('2026-01-15T12:00:00Z'))), '2026-02-01T06:00:00.000Z');
  // Steps: every 20 minutes
  assert.strictEqual(iso(computeNextRun('*/20 * * * *', 'UTC', new Date('2026-01-15T10:07:00Z'))), '2026-01-15T10:20:00.000Z');
  // Impossible date → null (Feb 30)
  assert.strictEqual(computeNextRun('0 0 30 2 *', 'UTC', new Date('2026-01-15T00:00:00Z')), null);
  console.log('  ✓ next-run basics (UTC)');
}

// ---------- Next run: dom/dow OR semantics ----------
{
  // '0 0 1 * 1' = midnight on the 1st AND every Monday (either fires).
  // From Thu 2026-01-15: next Monday is Jan 19, before Feb 1.
  assert.strictEqual(iso(computeNextRun('0 0 1 * 1', 'UTC', new Date('2026-01-15T12:00:00Z'))), '2026-01-19T00:00:00.000Z');
  // From Mon 2026-01-26 12:00: next is Feb 1 (the 1st), before Mon Feb 2.
  assert.strictEqual(iso(computeNextRun('0 0 1 * 1', 'UTC', new Date('2026-01-26T12:00:00Z'))), '2026-02-01T00:00:00.000Z');
  console.log('  ✓ dom/dow OR semantics');
}

// ---------- Next run: timezones ----------
{
  // Asia/Tehran is UTC+3:30 year-round. Daily 09:00 Tehran = 05:30 UTC.
  assert.strictEqual(
    iso(computeNextRun('0 9 * * *', 'Asia/Tehran', new Date('2026-01-15T00:00:00Z'))),
    '2026-01-15T05:30:00.000Z',
  );
  // After 09:00 Tehran same day → next day
  assert.strictEqual(
    iso(computeNextRun('0 9 * * *', 'Asia/Tehran', new Date('2026-01-15T06:00:00Z'))),
    '2026-01-16T05:30:00.000Z',
  );
  // America/New_York DST spring forward 2026: clocks jump Mar 8 02:00→03:00.
  // Daily 09:00 local: Mar 7 is EST (UTC-5) → 14:00Z; Mar 8 is EDT (UTC-4) → 13:00Z.
  assert.strictEqual(
    iso(computeNextRun('0 9 * * *', 'America/New_York', new Date('2026-03-06T15:00:00Z'))),
    '2026-03-07T14:00:00.000Z',
  );
  assert.strictEqual(
    iso(computeNextRun('0 9 * * *', 'America/New_York', new Date('2026-03-07T14:00:00Z'))),
    '2026-03-08T13:00:00.000Z',
  );
  // Invalid timezone throws (the tick parks such schedules)
  assert.throws(() => computeNextRun('* * * * *', 'Not/AZone', new Date()), /Invalid|Unsupported|not/);
  console.log('  ✓ timezone conversion incl. DST');
}

// ---------- Payload construction ----------
{
  const project = { id: 'p1', domain: 'example.com', normalized_domain: 'example.com' };

  const crawl = buildScheduledJobPayload('SITE_CRAWL', project, {});
  assert.deepStrictEqual(crawl, { kind: 'enqueue', payload: { domain: 'example.com', maxPages: 50 } });

  const bl = buildScheduledJobPayload('BACKLINK_SYNC', project, {});
  assert.deepStrictEqual(bl, { kind: 'enqueue', payload: { domain: 'example.com' } });

  const ps = buildScheduledJobPayload('PAGESPEED_CHECK', project, {});
  assert.deepStrictEqual(ps, { kind: 'enqueue', payload: { url: 'https://example.com' } });

  const alert = buildScheduledJobPayload('ALERT_EVALUATION', null, {});
  assert.strictEqual(alert.kind, 'enqueue', 'ALERT_EVALUATION must work without a project');

  const noProject = buildScheduledJobPayload('RANK_CHECK', null, {});
  assert.strictEqual(noProject.kind, 'skip');

  const briefNoId = buildScheduledJobPayload('CONTENT_BRIEF', project, {});
  assert.strictEqual(briefNoId.kind, 'skip', 'CONTENT_BRIEF without config.briefId must skip, not fabricate');
  const brief = buildScheduledJobPayload('CONTENT_BRIEF', project, { briefId: 'b-1' });
  assert.deepStrictEqual(brief, { kind: 'enqueue', payload: { briefId: 'b-1', targetKeyword: undefined } });

  const webhook = buildScheduledJobPayload('WEBHOOK_DELIVERY', project, {});
  assert.strictEqual(webhook.kind, 'skip', 'WEBHOOK_DELIVERY has no worker consumer');

  const override = buildScheduledJobPayload('SITE_CRAWL', project, { maxPages: 5, payload: { maxDepth: 2 } });
  assert.deepStrictEqual(override, { kind: 'enqueue', payload: { domain: 'example.com', maxPages: 5, maxDepth: 2 } });
  console.log('  ✓ payload construction');
}

console.log('✅ scheduler.test.ts — all assertions passed');
