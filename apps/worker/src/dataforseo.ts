/**
 * RankForge — Worker DataForSEO integration
 *
 * Real DataForSEO client + persistence helpers for the RANK_CHECK and
 * BACKLINK_SYNC job handlers in index.ts.
 *
 * Why this lives in the worker: the worker is a self-contained app (it
 * already carries its own copies of the crawler, SSRF guard and audit
 * engine), and the only complete DataForSEO client in the repo —
 * apps/api/src/lib/providers.ts — belongs to the API app and cannot be
 * imported across the standalone worker build. This module mirrors that
 * client's endpoints, payloads and response parsing so both sides speak
 * the same provider dialect. Keep the location table in sync with
 * apps/api/src/lib/providers.ts.
 *
 * No fake data: without credentials the client reports "not configured"
 * and the handlers keep failing jobs with PROVIDER_NOT_CONFIGURED.
 */

// ============================================================
// LOCATION / LANGUAGE MAPPING — DataForSEO Google location_code
// by ISO 3166-1 alpha-2 country (projects.country). Identical to
// the table in apps/api/src/lib/providers.ts — keep in sync.
// US (2840) is the fallback ONLY for unset/unknown countries.
// ============================================================

export const DATAFORSEO_LOCATION_CODES: Record<string, number> = {
  US: 2840, // United States
  GB: 2826, // United Kingdom
  DE: 2276, // Germany
  FR: 2250, // France
  ES: 2724, // Spain
  IT: 2380, // Italy
  NL: 2528, // Netherlands
  PL: 2616, // Poland
  TR: 2792, // Turkey
  AE: 2784, // United Arab Emirates
  SA: 2682, // Saudi Arabia
  EG: 2818, // Egypt
  IQ: 2368, // Iraq
  IL: 2376, // Israel
  IR: 2364, // Iran — Persian (fa) is a supported DataForSEO language_code
  IN: 2356, // India
  PK: 2586, // Pakistan
  ID: 2360, // Indonesia
  JP: 2392, // Japan
  KR: 2410, // South Korea
  CN: 2156, // China
  RU: 2643, // Russia
  BR: 2076, // Brazil
  MX: 2484, // Mexico
  CA: 2124, // Canada
  AU: 2036, // Australia
  ZA: 2710, // South Africa
};

export const DATAFORSEO_DEFAULT_LOCATION_CODE = DATAFORSEO_LOCATION_CODES.US;

export function resolveDataForSeoLocationCode(country?: string | null): number {
  if (!country) return DATAFORSEO_DEFAULT_LOCATION_CODE;
  return DATAFORSEO_LOCATION_CODES[country.trim().toUpperCase()] ?? DATAFORSEO_DEFAULT_LOCATION_CODE;
}

export function resolveDataForSeoLanguageCode(language?: string | null): string {
  return (language || 'en').trim().toLowerCase();
}

// ============================================================
// CLIENT — mirrors apps/api/src/lib/providers.ts (DataForSEO)
// ============================================================

export type FetchFn = (url: string, init?: any) => Promise<any>;

export class DataForSeoError extends Error {
  httpStatus?: number;
  providerStatusCode?: number;
  constructor(message: string, opts: { httpStatus?: number; providerStatusCode?: number } = {}) {
    super(message);
    this.name = 'DataForSeoError';
    this.httpStatus = opts.httpStatus;
    this.providerStatusCode = opts.providerStatusCode;
  }
}

export interface SerpOrganicResult {
  position: number;
  url: string;
  title: string;
  description: string;
  domain: string;
}

export interface SerpOutcome {
  keyword: string;
  results: SerpOrganicResult[];
  serpFeatures: string[];
  totalResults?: number;
  requestId?: string;
}

export interface ParsedBacklink {
  sourceDomain: string;
  sourceUrl: string;
  targetUrl: string;
  anchorText?: string;
  firstSeen?: string;
  lastSeen?: string;
  domainRating?: number;
  /** true/false only when the provider item carries an explicit dofollow flag. */
  isNofollow?: boolean;
  raw: any;
}

export interface SerpSearchRequest {
  locationCode: number;
  languageCode: string;
  device?: 'desktop' | 'mobile';
  /** SERP depth to fetch. Rank tracking needs the top 100, not just the top 20. */
  depth?: number;
}

export class DataForSeoClient {
  readonly baseUrl = 'https://api.dataforseo.com/v3';
  private fetchFn: FetchFn;

  constructor(
    private login: string,
    private password: string,
    fetchFn?: FetchFn,
  ) {
    this.fetchFn = fetchFn || ((url: string, init?: any) => fetch(url, init));
  }

  isConfigured(): boolean {
    return !!(this.login && this.password);
  }

  private authHeader(): string {
    return 'Basic ' + Buffer.from(`${this.login}:${this.password}`).toString('base64');
  }

  private async post(path: string, body: any[], context: string): Promise<any> {
    if (!this.isConfigured()) {
      throw new DataForSeoError('DataForSEO not configured — DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD not set');
    }

    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new DataForSeoError(`DataForSEO ${context} error ${response.status}: ${text}`, { httpStatus: response.status });
    }

    const data = await response.json();
    const task = data?.tasks?.[0];
    if (!task || task.status_code !== 20000) {
      throw new DataForSeoError(
        `DataForSEO ${context} task failed: ${task?.status_message || data?.status_message || 'Unknown'}`,
        { providerStatusCode: task?.status_code ?? data?.status_code },
      );
    }
    return task;
  }

  /** Live Google organic SERP — same endpoint/payload/parsing as the API lib client. */
  async searchSerp(keyword: string, req: SerpSearchRequest): Promise<SerpOutcome> {
    const task = await this.post('/serp/google/organic/live/advanced', [{
      keyword,
      location_code: req.locationCode,
      language_code: req.languageCode,
      device: req.device || 'desktop',
      depth: req.depth ?? 100,
    }], 'SERP');

    const result = task.result?.[0];
    const items = result?.items || [];

    return {
      keyword,
      results: items
        .filter((i: any) => i.type === 'organic')
        .map((item: any, idx: number) => ({
          position: item.rank_group || idx + 1,
          url: item.url,
          title: item.title,
          description: item.description || item.pre_snippet || '',
          domain: item.domain,
        })),
      serpFeatures: result?.item_types || [],
      totalResults: result?.se_results_count,
      requestId: task.id,
    };
  }

  /** Live backlinks for a domain — same endpoint/payload/parsing as the API lib client. */
  async getBacklinks(domain: string, limit = 100): Promise<ParsedBacklink[]> {
    const task = await this.post('/backlinks/backlinks/live', [{
      target: domain,
      limit,
      order_by: ['first_seen,desc'],
    }], 'backlinks');

    const items = task.result?.[0]?.items || [];

    return items.map((item: any) => ({
      sourceDomain: item.domain_from,
      sourceUrl: item.url_from,
      targetUrl: item.url_to,
      anchorText: item.anchor,
      firstSeen: item.first_seen,
      lastSeen: item.last_seen,
      domainRating: item.domain_from_rank,
      isNofollow: typeof item.dofollow === 'boolean' ? !item.dofollow : undefined,
      raw: item,
    }));
  }
}

// ============================================================
// PARSING HELPERS
// ============================================================

/** Normalize a domain/URL for comparison: lowercase host, no scheme/path/www. */
export function normalizeDomainForMatch(value: string): string {
  let v = (value || '').trim().toLowerCase();
  v = v.replace(/^https?:\/\//, '');
  v = v.split('/')[0].split('?')[0].split(':')[0];
  if (v.startsWith('www.')) v = v.slice(4);
  return v;
}

/** First organic SERP entry belonging to the target domain, or null if not ranked in the fetched depth. */
export function findDomainPosition(
  results: SerpOrganicResult[],
  targetDomain: string,
): SerpOrganicResult | null {
  const target = normalizeDomainForMatch(targetDomain);
  if (!target) return null;
  for (const r of results) {
    const candidate = normalizeDomainForMatch(r.domain || r.url || '');
    if (candidate === target) return r;
  }
  return null;
}

// ============================================================
// PERSISTENCE — used verbatim by the worker handlers; queryFn is
// the worker's pg query (or a test double with the same shape).
// ============================================================

export type QueryFn = (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount: number | null }>;

export interface RankPersistenceInput {
  organizationId: string;
  projectId: string;
  keywordId: string;
  position: number | null;
  url: string | null;
  country: string;
  language: string;
  device: string;
  engine?: string;
  rawData?: any;
}

/**
 * Persist one keyword's rank outcome:
 * - upsert today's keyword_rankings history row (previous_position = the
 *   keyword's last recorded current_position before this check)
 * - advance keywords.current_position / previous_position / last_checked_at
 */
export async function persistRankResult(queryFn: QueryFn, input: RankPersistenceInput): Promise<{ previousPosition: number | null }> {
  const engine = input.engine || 'google';

  const kwResult = await queryFn(`SELECT current_position FROM keywords WHERE id = $1`, [input.keywordId]);
  const previousPosition: number | null = kwResult.rows[0]?.current_position ?? null;

  await queryFn(
    `INSERT INTO keyword_rankings (organization_id, project_id, keyword_id, position, previous_position, url, search_engine, country, language, device, date, provider, raw_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_DATE, 'dataforseo', $11)
     ON CONFLICT (keyword_id, date, search_engine, country, device)
     DO UPDATE SET position = EXCLUDED.position, previous_position = EXCLUDED.previous_position,
                   url = EXCLUDED.url, provider = EXCLUDED.provider, raw_data = EXCLUDED.raw_data`,
    [
      input.organizationId, input.projectId, input.keywordId, input.position, previousPosition,
      input.url, engine, input.country, input.language, input.device,
      input.rawData ? JSON.stringify(input.rawData) : null,
    ],
  );

  await queryFn(
    `UPDATE keywords SET previous_position = $2, current_position = $3, last_checked_at = NOW(), provider = 'dataforseo', updated_at = NOW() WHERE id = $1`,
    [input.keywordId, previousPosition, input.position],
  );

  return { previousPosition };
}

export interface BacklinkSyncInput {
  organizationId: string;
  projectId: string;
  backlinks: ParsedBacklink[];
  /** Captured before the provider call; rows not re-seen since then are marked lost. */
  syncStartedAt: Date;
}

export interface BacklinkSyncStats {
  fetched: number;
  inserted: number;
  refreshed: number;
  lost: number;
}

function parseProviderDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Persist one backlink sync:
 * - upsert every fetched backlink (status back to 'active', last_seen_at = now)
 * - provider rows still 'active' but not re-seen in this sync → 'lost'
 */
export async function persistBacklinkSync(queryFn: QueryFn, input: BacklinkSyncInput): Promise<BacklinkSyncStats> {
  let inserted = 0;
  let refreshed = 0;

  for (const link of input.backlinks) {
    const firstSeen = parseProviderDate(link.firstSeen);
    const result = await queryFn(
      `INSERT INTO backlinks (project_id, organization_id, source_url, source_domain, target_url, anchor_text, domain_rating, is_nofollow, first_seen_at, last_seen_at, status, provider, evidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()), NOW(), 'active', 'dataforseo', $10)
       ON CONFLICT (project_id, source_url, target_url)
       DO UPDATE SET last_seen_at = NOW(), status = 'active',
                     anchor_text = EXCLUDED.anchor_text, domain_rating = EXCLUDED.domain_rating,
                     is_nofollow = EXCLUDED.is_nofollow, provider = 'dataforseo', evidence = EXCLUDED.evidence
       RETURNING (xmax = 0) AS was_inserted`,
      [
        input.projectId, input.organizationId, link.sourceUrl, link.sourceDomain || null,
        link.targetUrl, link.anchorText || null,
        typeof link.domainRating === 'number' ? Math.round(link.domainRating) : null,
        link.isNofollow ?? false,
        firstSeen,
        JSON.stringify(link.raw ?? {}),
      ],
    );
    if (result.rows[0]?.was_inserted) inserted++;
    else refreshed++;
  }

  const lostResult = await queryFn(
    `UPDATE backlinks SET status = 'lost'
     WHERE project_id = $1 AND organization_id = $2 AND provider = 'dataforseo' AND status = 'active' AND last_seen_at < $3`,
    [input.projectId, input.organizationId, input.syncStartedAt],
  );

  return { fetched: input.backlinks.length, inserted, refreshed, lost: lostResult.rowCount ?? 0 };
}
