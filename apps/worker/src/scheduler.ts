/**
 * RankForge — Worker scheduler runner
 *
 * The API has always exposed scheduled_jobs CRUD (cron_expression +
 * timezone per row) but nothing ever executed them — REVIEW.md §4:
 * "no cron executor exists". This module is that executor. The worker
 * calls runSchedulerTick() on a throttled interval from its main loop.
 *
 * Semantics (deliberate, documented):
 * - A schedule with next_run_at NULL has never been armed: the tick
 *   computes its first next_run_at from the cron expression and does
 *   NOT fire it retroactively.
 * - A due schedule fires exactly once per tick. The next run is the
 *   first cron slot strictly after *now* — occurrences missed while
 *   the worker was down are skipped, never caught up in a storm.
 * - Double-enqueue protection is layered: rows are claimed inside a
 *   transaction with FOR UPDATE SKIP LOCKED, and the job row carries
 *   idempotency_key `sched_<scheduleId>_<dueSlotISO>` against the
 *   jobs table's UNIQUE constraint (ON CONFLICT DO NOTHING).
 * - An unparseable cron expression (or unknown timezone) parks the
 *   schedule at next_run_at = 'infinity' with an error log — it can
 *   never hot-loop the tick, and re-arming only needs a data fix.
 * - Schedules whose type has no worker consumer (WEBHOOK_DELIVERY) or
 *   whose required inputs are missing (project, config.briefId for
 *   CONTENT_BRIEF) are advanced without enqueueing, and logged.
 *
 * Cron support: standard 5 fields (minute hour day-of-month month
 * day-of-week), with `*`, single values, ranges `a-b`, steps `* /n`
 * and `a-b/n`, and comma lists. Day-of-week 0 and 7 both mean Sunday.
 * When BOTH day-of-month and day-of-week are restricted, standard
 * cron OR semantics apply (either match fires). Month/day names are
 * not supported. Timezones are IANA names resolved with Intl — no
 * external cron dependency, matching the worker's dependency diet.
 */

// ============================================================
// CRON PARSING
// ============================================================

export interface CronSpec {
  minutes: Set<number>;
  hours: Set<number>;
  months: Set<number>;
  /** null = unrestricted (`*`) */
  dom: Set<number> | null;
  /** null = unrestricted (`*`); values normalized to 0-6, 0 = Sunday */
  dow: Set<number> | null;
}

function parseCronField(field: string, min: number, max: number, label: string): { values: Set<number>; restricted: boolean } {
  const values = new Set<number>();
  let restricted = false;

  for (const rawPart of field.split(',')) {
    const part = rawPart.trim();
    if (!part) throw new Error(`Invalid cron ${label} field: "${field}"`);

    let rangePart = part;
    let step = 1;
    const slash = part.indexOf('/');
    if (slash >= 0) {
      rangePart = part.slice(0, slash);
      const stepRaw = part.slice(slash + 1);
      step = Number(stepRaw);
      if (!Number.isInteger(step) || step <= 0) throw new Error(`Invalid cron ${label} step: "${part}"`);
    }

    let lo: number;
    let hi: number;
    if (rangePart === '*') {
      lo = min;
      hi = max;
      if (slash < 0) {
        // pure `*` with no step → unrestricted
        for (let v = min; v <= max; v++) values.add(v);
        continue;
      }
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-').map((s) => Number(s));
      if (!Number.isInteger(a) || !Number.isInteger(b)) throw new Error(`Invalid cron ${label} range: "${part}"`);
      lo = a;
      hi = b;
      restricted = true;
    } else {
      const v = Number(rangePart);
      if (!Number.isInteger(v)) throw new Error(`Invalid cron ${label} value: "${part}"`);
      lo = v;
      hi = v;
      restricted = true;
    }

    if (lo < min || hi > max || lo > hi) throw new Error(`Cron ${label} out of range (${min}-${max}): "${part}"`);
    for (let v = lo; v <= hi; v += step) values.add(v);
    if (slash >= 0 && rangePart === '*') restricted = true;
  }

  return { values, restricted };
}

export function parseCronExpression(expression: string): CronSpec {
  const fields = (expression || '').trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Invalid cron expression "${expression}" — expected 5 fields (minute hour day-of-month month day-of-week)`);
  }
  const minutes = parseCronField(fields[0], 0, 59, 'minute');
  const hours = parseCronField(fields[1], 0, 23, 'hour');
  const dom = parseCronField(fields[2], 1, 31, 'day-of-month');
  const months = parseCronField(fields[3], 1, 12, 'month');
  const dowRaw = parseCronField(fields[4], 0, 7, 'day-of-week');
  // Normalize 7 → 0 (both are Sunday)
  const dowValues = new Set<number>();
  for (const v of dowRaw.values) dowValues.add(v === 7 ? 0 : v);

  return {
    minutes: minutes.values,
    hours: hours.values,
    months: months.values,
    dom: dom.restricted ? dom.values : null,
    dow: dowRaw.restricted ? dowValues : null,
  };
}

// ============================================================
// TIMEZONE-AWARE NEXT-RUN COMPUTATION
// Wall-clock arithmetic is done on a pseudo-UTC clock (wall parts
// treated as UTC for stepping), then converted back to a real
// instant with the zone offset — the standard Intl technique.
// ============================================================

interface WallParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  dow: number; // 0-6, 0 = Sunday
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function wallPartsOf(instant: Date, timezone: string): WallParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  return {
    year: Number(m.year),
    month: Number(m.month),
    day: Number(m.day),
    hour: Number(m.hour) % 24,
    minute: Number(m.minute),
    dow: WEEKDAYS[m.weekday] ?? 0,
  };
}

function tzOffsetMs(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const asUtc = Date.UTC(Number(m.year), Number(m.month) - 1, Number(m.day), Number(m.hour) % 24, Number(m.minute), Number(m.second));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function wallToUtc(wall: WallParts, timezone: string): Date {
  const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0);
  let guess = wallAsUtc;
  for (let i = 0; i < 3; i++) {
    const next = wallAsUtc - tzOffsetMs(new Date(guess), timezone);
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

function pseudoDate(wall: WallParts): Date {
  return new Date(Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0));
}

function fromPseudo(d: Date): WallParts {
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    dow: d.getUTCDay(),
  };
}

function dayMatches(spec: CronSpec, wall: WallParts): boolean {
  const domMatch = spec.dom === null || spec.dom.has(wall.day);
  const dowMatch = spec.dow === null || spec.dow.has(wall.dow);
  if (spec.dom !== null && spec.dow !== null) return domMatch || dowMatch; // standard cron OR
  return domMatch && dowMatch;
}

/**
 * First instant strictly after `after` whose wall-clock time in
 * `timezone` matches the cron expression — or null if none exists
 * within ~1 year (e.g. February 30th). Throws on invalid cron/timezone.
 */
export function computeNextRun(expression: string, timezone: string, after: Date): Date | null {
  const spec = parseCronExpression(expression);
  const tz = timezone || 'UTC';
  // Validate the zone eagerly so a bad name throws here, not mid-loop.
  wallPartsOf(after, tz);

  // Start from the wall time of the first whole minute after `after`.
  const startInstant = new Date(Math.floor(after.getTime() / 60000) * 60000 + 60000);
  let wall = wallPartsOf(startInstant, tz);

  for (let guard = 0; guard < 200000; guard++) {
    if (!spec.months.has(wall.month)) {
      const d = pseudoDate(wall);
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCMonth(d.getUTCMonth() + 1);
      wall = fromPseudo(d);
      continue;
    }
    if (!dayMatches(spec, wall)) {
      const d = pseudoDate(wall);
      d.setUTCDate(d.getUTCDate() + 1);
      d.setUTCHours(0, 0, 0, 0);
      wall = fromPseudo(d);
      continue;
    }
    if (!spec.hours.has(wall.hour)) {
      const d = pseudoDate(wall);
      d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0);
      wall = fromPseudo(d);
      continue;
    }
    if (!spec.minutes.has(wall.minute)) {
      const d = pseudoDate(wall);
      d.setUTCMinutes(d.getUTCMinutes() + 1, 0, 0);
      wall = fromPseudo(d);
      continue;
    }
    const utc = wallToUtc(wall, tz);
    if (utc.getTime() > after.getTime()) return utc;
    // Wall time exists but resolves to an instant <= after (fall-back
    // overlap): step one wall minute and keep looking.
    const d = pseudoDate(wall);
    d.setUTCMinutes(d.getUTCMinutes() + 1, 0, 0);
    wall = fromPseudo(d);
  }
  return null;
}

// ============================================================
// JOB PAYLOAD CONSTRUCTION — mirrors what the API enqueues for the
// same job types (see apps/api/src/app.ts crawl/brief/geo routes and
// the worker handlers' payload expectations).
// ============================================================

export interface ScheduleProject {
  id: string;
  domain: string;
  normalized_domain: string;
}

export type PayloadDecision =
  | { kind: 'enqueue'; payload: Record<string, any> }
  | { kind: 'skip'; reason: string };

export function buildScheduledJobPayload(
  type: string,
  project: ScheduleProject | null,
  scheduleConfig: any,
): PayloadDecision {
  const cfg = scheduleConfig && typeof scheduleConfig === 'object' ? scheduleConfig : {};
  const overrides = cfg.payload && typeof cfg.payload === 'object' ? cfg.payload : {};
  const withOverrides = (base: Record<string, any>): PayloadDecision => ({ kind: 'enqueue', payload: { ...base, ...overrides } });

  switch (type) {
    case 'ALERT_EVALUATION':
      // Org-level handler — works without a project.
      return withOverrides({});
    case 'SITE_CRAWL':
      if (!project) return { kind: 'skip', reason: 'SITE_CRAWL schedule has no project' };
      return withOverrides({ domain: project.normalized_domain || project.domain, maxPages: cfg.maxPages ?? 50 });
    case 'SEO_AUDIT':
      if (!project) return { kind: 'skip', reason: 'SEO_AUDIT schedule has no project' };
      return withOverrides({});
    case 'RANK_CHECK':
      if (!project) return { kind: 'skip', reason: 'RANK_CHECK schedule has no project' };
      return withOverrides({});
    case 'BACKLINK_SYNC':
      if (!project) return { kind: 'skip', reason: 'BACKLINK_SYNC schedule has no project' };
      return withOverrides({ domain: project.normalized_domain || project.domain });
    case 'GSC_SYNC':
    case 'GA4_SYNC':
      if (!project) return { kind: 'skip', reason: `${type} schedule has no project` };
      return withOverrides({});
    case 'PAGESPEED_CHECK':
      if (!project) return { kind: 'skip', reason: 'PAGESPEED_CHECK schedule has no project' };
      return withOverrides({ url: `https://${project.normalized_domain || project.domain}` });
    case 'COMPETITOR_CHECK':
      if (!project) return { kind: 'skip', reason: 'COMPETITOR_CHECK schedule has no project' };
      return withOverrides({});
    case 'REPORT_GENERATION':
      if (!project) return { kind: 'skip', reason: 'REPORT_GENERATION schedule has no project' };
      return withOverrides({ type: cfg.reportType || 'seo' });
    case 'CONTENT_BRIEF':
      if (!project) return { kind: 'skip', reason: 'CONTENT_BRIEF schedule has no project' };
      if (!cfg.briefId || typeof cfg.briefId !== 'string') {
        return { kind: 'skip', reason: 'CONTENT_BRIEF schedule requires config.briefId (a brief must exist before it can be generated)' };
      }
      return withOverrides({ briefId: cfg.briefId, targetKeyword: cfg.targetKeyword });
    case 'WEBHOOK_DELIVERY':
      return { kind: 'skip', reason: 'WEBHOOK_DELIVERY has no worker consumer — webhooks are delivered by the API, not the job queue' };
    default:
      return { kind: 'skip', reason: `Unknown schedule type: ${type}` };
  }
}

// ============================================================
// TICK — claim due schedules in one transaction, enqueue their jobs,
// advance next_run_at. Safe under concurrent workers (SKIP LOCKED +
// job idempotency keys).
// ============================================================

export interface SchedulerTickSummary {
  fired: number;
  initialized: number;
  skipped: number;
  parked: number;
  jobIds: string[];
}

type TxFn = <T>(fn: (client: any) => Promise<T>) => Promise<T>;

export async function runSchedulerTick(withTransaction: TxFn, now: Date = new Date()): Promise<SchedulerTickSummary> {
  const summary: SchedulerTickSummary = { fired: 0, initialized: 0, skipped: 0, parked: 0, jobIds: [] };

  await withTransaction(async (client) => {
    const due = await client.query(
      `SELECT id, organization_id, project_id, type, cron_expression, timezone, config, next_run_at
       FROM scheduled_jobs
       WHERE enabled = true AND (next_run_at IS NULL OR next_run_at <= NOW())
       ORDER BY next_run_at ASC NULLS FIRST
       LIMIT 50
       FOR UPDATE SKIP LOCKED`,
    );

    for (const row of due.rows) {
      const tz = row.timezone || 'UTC';

      let nextRun: Date | null;
      try {
        nextRun = computeNextRun(row.cron_expression, tz, now);
        if (!nextRun) throw new Error(`Cron expression "${row.cron_expression}" has no occurrence within a year`);
      } catch (e) {
        console.error(JSON.stringify({
          level: 'error', msg: 'Scheduler: parking schedule with unusable cron/timezone',
          schedule_id: row.id, cron_expression: row.cron_expression, timezone: tz,
          error: e instanceof Error ? e.message : String(e),
        }));
        await client.query(
          `UPDATE scheduled_jobs SET next_run_at = 'infinity', updated_at = NOW() WHERE id = $1`,
          [row.id],
        );
        summary.parked++;
        continue;
      }

      // Never armed → arm only, no retroactive fire.
      if (row.next_run_at === null) {
        await client.query(
          `UPDATE scheduled_jobs SET next_run_at = $2, updated_at = NOW() WHERE id = $1`,
          [row.id, nextRun],
        );
        summary.initialized++;
        continue;
      }

      // Due → build the job.
      let project: ScheduleProject | null = null;
      if (row.project_id) {
        const p = await client.query(
          `SELECT id, domain, normalized_domain FROM projects WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
          [row.project_id, row.organization_id],
        );
        project = p.rows[0] || null;
      }

      const decision = buildScheduledJobPayload(row.type, project, row.config);
      if (decision.kind === 'skip') {
        console.log(JSON.stringify({
          level: 'warn', msg: 'Scheduler: schedule advanced without enqueueing',
          schedule_id: row.id, type: row.type, reason: decision.reason,
        }));
        summary.skipped++;
      } else {
        const dueSlot = row.next_run_at instanceof Date ? row.next_run_at : new Date(row.next_run_at);
        const inserted = await client.query(
          `INSERT INTO jobs (organization_id, project_id, type, status, payload, attempts, max_attempts, scheduled_at, idempotency_key, execution_id)
           VALUES ($1, $2, $3, 'pending', $4, 0, 3, NULL, $5, gen_random_uuid())
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING id`,
          [
            row.organization_id,
            row.project_id || null,
            row.type,
            JSON.stringify(decision.payload),
            `sched_${row.id}_${dueSlot.toISOString()}`,
          ],
        );
        if (inserted.rows.length > 0) {
          summary.fired++;
          summary.jobIds.push(inserted.rows[0].id);
        } else {
          // Same slot already enqueued by another tick/worker — count as skip.
          summary.skipped++;
        }
      }

      await client.query(
        `UPDATE scheduled_jobs SET last_run_at = NOW(), next_run_at = $2, updated_at = NOW() WHERE id = $1`,
        [row.id, nextRun],
      );
    }
  });

  return summary;
}
