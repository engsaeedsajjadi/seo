// KWRank (kwrank.ir) — an Iranian rank tracker with a Web API.
//
// Unlike a SERP API, KWRank checks positions itself on its own schedule. The worker keeps the
// project's domain and keywords registered there and reads back the latest positions.
// API reference: https://kwrank.ir/documentation/web-api/reference/
import { normalizeDomainForMatch, type FetchFn } from './dataforseo.js';

/** Persian text is typed with different letters and spacing; these count as the same keyword. */
export function normalizePersianKeyword(value: string): string {
  return (value || '')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه')
    .replace(/[\u200c\u200f\u200e]/g, ' ')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .trim().toLowerCase().replace(/\s+/g, ' ');
}

export class KwRankError extends Error {
  httpStatus?: number;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.name = 'KwRankError';
    this.httpStatus = httpStatus;
  }
}

export type KwRankDevice = 'desktop' | 'android' | 'ios';

export interface KwRankKeyword {
  id: number;
  keyword: string;
  device: string;
  active: boolean;
  /** False until KWRank has checked the keyword at least once. */
  checked: boolean;
  /** Position in the first 100 Google results, null when the site is not there. */
  rank: number | null;
  url: string | null;
  rankUpdatedAt: string | null;
  country: string | null;
  averageMonthlySearches: number | null;
  competition: string | null;
}

/** KWRank country ids, from its countries-and-cities endpoint. */
export const KWRANK_COUNTRY_IDS: Record<string, number> = { IR: 1, GB: 3, US: 5, DE: 7, AU: 8 };

export function kwRankDevice(projectDevice?: string | null): KwRankDevice {
  return projectDevice === 'mobile' ? 'android' : 'desktop';
}

export class KwRankClient {
  private token: string | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly baseUrl = 'https://kwrank.ir/api/v1',
    private readonly fetchFn: FetchFn = fetch,
    private readonly timeoutMs = 30000,
  ) {}

  isConfigured(): boolean {
    return this.clientId.length > 0 && this.clientSecret.length > 0;
  }

  /** The token does not expire, so one is fetched per process and renewed only when refused. */
  private async authorize(): Promise<string> {
    const form = new FormData();
    form.set('client_id', this.clientId);
    form.set('secret_id', this.clientSecret);
    const body = await this.send('POST', '/authorize', form, false);
    if (!body?.access_token) throw new KwRankError('authorization returned no token');
    this.token = String(body.access_token);
    return this.token;
  }

  private async request(method: string, path: string, form?: FormData): Promise<any> {
    const token = this.token ?? await this.authorize();
    try {
      return await this.send(method, path, form, true, token);
    } catch (error) {
      if (error instanceof KwRankError && error.httpStatus === 401) {
        this.token = null;
        return this.send(method, path, form, true, await this.authorize());
      }
      throw error;
    }
  }

  private async send(method: string, path: string, form: FormData | undefined, auth: boolean, token?: string): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: any;
    try {
      response = await this.fetchFn(`${this.baseUrl.replace(/\/+$/, '')}${path}`, {
        method,
        headers: { Accept: 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) },
        body: form,
        signal: controller.signal,
      });
    } catch (error) {
      throw new KwRankError(`request failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }
    const text = await response.text();
    let body: any = null;
    try { body = JSON.parse(text); } catch { /* reported below */ }
    const status = Number(body?.status) || response.status;
    if (!response.ok || body?.result === false) {
      const message = typeof body?.message === 'string' ? body.message : text.slice(0, 200);
      throw new KwRankError(`HTTP ${status}: ${message}`, status >= 400 ? status : response.status);
    }
    if (!body) throw new KwRankError('response is not JSON');
    return body;
  }

  /** Every page of a paginated list. */
  private async all(path: string, key: string, params: Record<string, string>): Promise<any[]> {
    const items: any[] = [];
    for (let page = 1; page <= 50; page++) {
      const query = new URLSearchParams({ ...params, page: String(page), limit: '100' });
      const body = await this.request('GET', `${path}?${query.toString()}`);
      const list = body?.[key];
      const data: any[] = Array.isArray(list?.data) ? list.data : [];
      items.push(...data);
      if (!list?.next_page_url || data.length === 0) break;
    }
    return items;
  }

  /** The KWRank id of a domain, registering it when it is not there yet. */
  async ensureDomain(domain: string): Promise<{ id: number; created: boolean; active: boolean }> {
    const target = normalizeDomainForMatch(domain);
    const domains = await this.all('/domains', 'domains_list', { link_type: 'all' });
    const found = domains.find((d) => normalizeDomainForMatch(String(d?.link ?? '')) === target);
    if (found) return { id: Number(found.id), created: false, active: Boolean(found.is_active) };
    const form = new FormData();
    form.set('domain', target);
    const body = await this.request('POST', '/domains', form);
    if (!body?.id) throw new KwRankError('adding the domain returned no id');
    return { id: Number(body.id), created: true, active: true };
  }

  async listKeywords(domainId: number): Promise<KwRankKeyword[]> {
    const rows = await this.all(`/domain/${domainId}/keywords`, 'keywords_list', { keyword_type: 'all' });
    return rows.map((r) => ({
      id: Number(r.id),
      keyword: String(r.keyword_name ?? ''),
      device: String(r.device_type ?? ''),
      active: Boolean(r.is_active),
      checked: Boolean(r.has_the_ranking_ever_been_checked),
      rank: typeof r.rank === 'number' && r.rank > 0 ? r.rank : null,
      url: typeof r.link === 'string' && r.link ? r.link : null,
      rankUpdatedAt: r.rank_updated_at ? String(r.rank_updated_at) : null,
      country: r.country ? String(r.country) : null,
      averageMonthlySearches: typeof r.average_monthly_searches === 'number' ? r.average_monthly_searches : null,
      competition: r.competition ? String(r.competition) : null,
    }));
  }

  async addKeywords(domainId: number, keywords: string[], countryId: number, device: KwRankDevice): Promise<number> {
    let added = 0;
    // Sent in batches so one request stays small.
    for (let i = 0; i < keywords.length; i += 50) {
      const form = new FormData();
      keywords.slice(i, i + 50).forEach((k, n) => form.set(`keywords[${n}]`, k));
      form.set('country_id', String(countryId));
      form.set('device_type', device);
      const body = await this.request('POST', `/domain/${domainId}/keywords`, form);
      added += Array.isArray(body?.keywords) ? body.keywords.length : 0;
    }
    return added;
  }
}

/** Matches KWRank rows to the project's keywords by text and device. */
export function matchKwRankKeywords(
  projectKeywords: { id: string; term: string }[],
  remote: KwRankKeyword[],
  device: KwRankDevice,
): { matched: { keywordId: string; remote: KwRankKeyword }[]; missing: { id: string; term: string }[] } {
  const byText = new Map<string, KwRankKeyword>();
  for (const r of remote) {
    if (r.device === device) byText.set(normalizePersianKeyword(r.keyword), r);
  }
  const matched: { keywordId: string; remote: KwRankKeyword }[] = [];
  const missing: { id: string; term: string }[] = [];
  for (const k of projectKeywords) {
    const hit = byText.get(normalizePersianKeyword(k.term));
    if (hit) matched.push({ keywordId: k.id, remote: hit });
    else missing.push(k);
  }
  return { matched, missing };
}
