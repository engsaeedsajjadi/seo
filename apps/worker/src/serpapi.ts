// Google rank lookup through SerpApi, or any service that answers in the SerpApi format
// (SERPAPI_BASE_URL points at it). Used when DataForSEO is not configured.
//
// Google often returns 10 organic results per request whatever `num` asks for, so the
// client pages with `start` until the site is found or the depth is reached. Each page
// is one billed search, so the lookup stops as soon as the site appears.
import { normalizeDomainForMatch, type FetchFn, type SerpOrganicResult, type SerpOutcome } from './dataforseo.js';

export class SerpApiError extends Error {
  httpStatus?: number;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.name = 'SerpApiError';
    this.httpStatus = httpStatus;
  }
}

export interface SerpApiRequest {
  /** ISO country code of the project, e.g. IR. */
  country: string;
  /** Interface language, e.g. fa. */
  language: string;
  device: 'desktop' | 'mobile';
  /** How deep to look, 10 to 100. */
  depth: number;
  /** Stop paging once this domain is found. */
  targetDomain?: string;
}

export interface SerpApiOutcome extends SerpOutcome {
  /** Billed searches used for this keyword. */
  requests: number;
}

const PAGE_SIZE = 10;

export class SerpApiClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://serpapi.com',
    private readonly fetchFn: FetchFn = fetch,
    private readonly timeoutMs = 30000,
  ) {}

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async searchSerp(keyword: string, request: SerpApiRequest): Promise<SerpApiOutcome> {
    const depth = Math.min(100, Math.max(PAGE_SIZE, request.depth));
    const target = request.targetDomain ? normalizeDomainForMatch(request.targetDomain) : '';
    const results: SerpOrganicResult[] = [];
    const seen = new Set<string>();
    let requests = 0;
    let totalResults: number | undefined;
    let requestId: string | undefined;

    for (let start = 0; start < depth; start += PAGE_SIZE) {
      const page = await this.fetchPage(keyword, request, start);
      requests++;
      requestId ??= page.search_metadata?.id;
      totalResults ??= Number(page.search_information?.total_results) || undefined;
      const organic: any[] = Array.isArray(page.organic_results) ? page.organic_results : [];
      for (const item of organic) {
        const url = typeof item?.link === 'string' ? item.link : '';
        // Pages can overlap; a URL keeps the first position it was seen at.
        if (!url || seen.has(url)) continue;
        seen.add(url);
        results.push({
          position: results.length + 1,
          url,
          title: String(item.title ?? ''),
          description: String(item.snippet ?? ''),
          domain: normalizeDomainForMatch(url),
        });
      }
      const found = target && results.some((r) => r.domain === target);
      // No next page, or fewer results than a full page: the SERP has ended.
      if (found || organic.length === 0 || (!page.serpapi_pagination?.next && !page.pagination?.next)) break;
    }

    return { keyword, results: results.slice(0, depth), serpFeatures: [], totalResults, requestId, requests };
  }

  private async fetchPage(keyword: string, request: SerpApiRequest, start: number): Promise<any> {
    const params = new URLSearchParams({
      engine: 'google',
      q: keyword,
      google_domain: 'google.com',
      gl: request.country.toLowerCase(),
      hl: request.language.toLowerCase(),
      device: request.device,
      num: String(PAGE_SIZE),
      api_key: this.apiKey,
    });
    if (start > 0) params.set('start', String(start));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: any;
    try {
      response = await this.fetchFn(`${this.baseUrl.replace(/\/+$/, '')}/search.json?${params.toString()}`, { signal: controller.signal });
    } catch (error) {
      throw new SerpApiError(`request failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }
    const text = await response.text();
    let body: any = null;
    try { body = JSON.parse(text); } catch { /* reported below */ }
    if (!response.ok) {
      throw new SerpApiError(`HTTP ${response.status}: ${String(body?.error ?? text).slice(0, 200)}`, response.status);
    }
    if (!body) throw new SerpApiError('response is not JSON');
    // "Google hasn't returned any results for this query." is an empty SERP, not a failure.
    if (body.error && !/hasn't returned any results/i.test(String(body.error))) {
      throw new SerpApiError(String(body.error).slice(0, 200), 200);
    }
    return body;
  }
}

/** Depth from RANK_CHECK_DEPTH, default 50; every 10 positions costs one search. */
export function rankDepth(value = process.env.RANK_CHECK_DEPTH): number {
  const depth = Number(value);
  if (!Number.isFinite(depth) || depth <= 0) return 50;
  return Math.min(100, Math.max(10, Math.round(depth / 10) * 10));
}
