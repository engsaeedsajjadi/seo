/**
 * RankForge — Provider Abstraction
 * DataForSEO, SerpApi, and future providers
 * No fake data — explicit NOT_CONFIGURED states
 */

export interface SearchOptions {
  country?: string;
  language?: string;
  device?: 'desktop' | 'mobile';
  location?: string;
  engine?: 'google' | 'bing' | 'yahoo';
  limit?: number;
}

export interface KeywordOptions extends SearchOptions {
  limit?: number;
  includeSerpInfo?: boolean;
  includeSeedKeyword?: boolean;
}

export interface SerpResult {
  query: string;
  results: Array<{
    position: number;
    url: string;
    title: string;
    description: string;
    domain: string;
    isAd?: boolean;
    type?: string;
  }>;
  serpFeatures: string[];
  totalResults?: number;
  provider: string;
  requestId?: string;
  timestamp: string;
}

export interface KeywordData {
  keyword: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
  difficulty: number | null;
  intent?: 'informational' | 'navigational' | 'commercial' | 'transactional';
  serpFeatures?: string[];
  trend?: number[];
  provider: string;
}

export interface BacklinkData {
  sourceDomain: string;
  sourceUrl: string;
  targetUrl: string;
  anchorText?: string;
  firstSeen: string;
  lastSeen: string;
  domainRating?: number;
  provider: string;
}

export interface ProviderStatus {
  configured: boolean;
  error?: string;
}

// Base interface
export interface SearchProvider {
  name: string;
  isConfigured(): boolean;
  getStatus(): ProviderStatus;
  search(query: string, options?: SearchOptions): Promise<SerpResult>;
  getKeywords(seed: string[], options?: KeywordOptions): Promise<KeywordData[]>;
  getBacklinks(domain: string, options?: SearchOptions): Promise<BacklinkData[]>;
  getCompetitors(domain: string, options?: SearchOptions): Promise<string[]>;
  getDomainKeywords(domain: string, options?: SearchOptions): Promise<KeywordData[]>;
}

// DataForSEO Provider
export class DataForSEOProvider implements SearchProvider {
  name = 'dataforseo';
  private login: string;
  private password: string;
  private baseUrl = 'https://api.dataforseo.com/v3';

  constructor(login?: string, password?: string) {
    this.login = login || process.env.DATAFORSEO_LOGIN || '';
    this.password = password || process.env.DATAFORSEO_PASSWORD || '';
  }

  isConfigured(): boolean {
    return !!(this.login && this.password);
  }

  getStatus(): ProviderStatus {
    if (!this.isConfigured()) {
      return { configured: false, error: 'DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD not set' };
    }
    return { configured: true };
  }

  private getAuthHeader(): string {
    return 'Basic ' + Buffer.from(`${this.login}:${this.password}`).toString('base64');
  }

  async search(query: string, options: SearchOptions = {}): Promise<SerpResult> {
    if (!this.isConfigured()) {
      throw new Error('DataForSEO not configured');
    }

    const body = [{
      keyword: query,
      location_code: 2840, // US default, should map country to code
      language_code: options.language || 'en',
      device: options.device || 'desktop',
      depth: 20,
    }];

    const response = await fetch(`${this.baseUrl}/serp/google/organic/live/advanced`, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DataForSEO SERP error ${response.status}: ${text}`);
    }

    const data = await response.json() as any;
    const task = data.tasks?.[0];
    if (!task || task.status_code !== 20000) {
      throw new Error(`DataForSEO task failed: ${task?.status_message || 'Unknown'}`);
    }

    const result = task.result?.[0];
    const items = result?.items || [];

    return {
      query,
      results: items.filter((i: any) => i.type === 'organic').map((item: any, idx: number) => ({
        position: item.rank_group || idx + 1,
        url: item.url,
        title: item.title,
        description: item.description || item.pre_snippet || '',
        domain: item.domain,
        type: item.type,
      })),
      serpFeatures: result?.item_types || [],
      totalResults: result?.se_results_count,
      provider: 'dataforseo',
      requestId: task.id,
      timestamp: new Date().toISOString(),
    };
  }

  async getKeywords(seed: string[], options: KeywordOptions = {}): Promise<KeywordData[]> {
    if (!this.isConfigured()) throw new Error('DataForSEO not configured');

    const body = [{
      keywords: seed,
      location_code: 2840,
      language_code: options.language || 'en',
      include_serp_info: options.includeSerpInfo ?? true,
      limit: options.limit ?? 100,
    }];

    const response = await fetch(`${this.baseUrl}/dataforseo_labs/google/related_keywords/live`, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DataForSEO keywords error ${response.status}: ${text}`);
    }

    const data = await response.json() as any;
    const task = data.tasks?.[0];
    if (task?.status_code !== 20000) throw new Error(`DataForSEO task failed: ${task?.status_message}`);

    const items = task.result?.[0]?.items || [];

    return items.map((item: any) => ({
      keyword: item.keyword,
      searchVolume: item.keyword_info?.search_volume ?? null,
      cpc: item.keyword_info?.cpc ?? null,
      competition: item.keyword_info?.competition ?? null,
      difficulty: item.keyword_properties?.keyword_difficulty ?? null,
      serpFeatures: item.serp_info?.serp_item_types || [],
      provider: 'dataforseo',
    }));
  }

  async getBacklinks(domain: string, options: SearchOptions = {}): Promise<BacklinkData[]> {
    if (!this.isConfigured()) throw new Error('DataForSEO not configured');

    const body = [{
      target: domain,
      limit: 100,
      order_by: ['first_seen,desc'],
    }];

    const response = await fetch(`${this.baseUrl}/backlinks/backlinks/live`, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DataForSEO backlinks error ${response.status}: ${text}`);
    }

    const data = await response.json() as any;
    const task = data.tasks?.[0];
    if (task?.status_code !== 20000) throw new Error(`DataForSEO task failed: ${task?.status_message}`);

    const items = task.result?.[0]?.items || [];

    return items.map((item: any) => ({
      sourceDomain: item.domain_from,
      sourceUrl: item.url_from,
      targetUrl: item.url_to,
      anchorText: item.anchor,
      firstSeen: item.first_seen,
      lastSeen: item.last_seen,
      domainRating: item.domain_from_rank,
      provider: 'dataforseo',
    }));
  }

  async getCompetitors(domain: string, options: SearchOptions = {}): Promise<string[]> {
    if (!this.isConfigured()) throw new Error('DataForSEO not configured');

    const body = [{
      target: domain,
      location_code: 2840,
      language_code: options.language || 'en',
      limit: 20,
    }];

    const response = await fetch(`${this.baseUrl}/dataforseo_labs/google/competitors_domain/live`, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DataForSEO competitors error ${response.status}: ${text}`);
    }

    const data = await response.json() as any;
    const task = data.tasks?.[0];
    if (task?.status_code !== 20000) throw new Error(`DataForSEO task failed: ${task?.status_message}`);

    const items = task.result?.[0]?.items || [];
    return items.map((i: any) => i.domain).filter(Boolean);
  }

  async getDomainKeywords(domain: string, options: SearchOptions = {}): Promise<KeywordData[]> {
    if (!this.isConfigured()) throw new Error('DataForSEO not configured');

    const body = [{
      target: domain,
      location_code: 2840,
      language_code: options.language || 'en',
      limit: options.limit ?? 100,
    }];

    const response = await fetch(`${this.baseUrl}/dataforseo_labs/google/domain_rank_overview/live`, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DataForSEO domain keywords error ${response.status}: ${text}`);
    }

    const data = await response.json() as any;
    const task = data.tasks?.[0];
    if (task?.status_code !== 20000) throw new Error(`DataForSEO task failed: ${task?.status_message}`);

    // This endpoint returns overview, not keywords — for keywords use ranked_keywords
    // Fallback to ranked_keywords
    const body2 = [{
      target: domain,
      location_code: 2840,
      language_code: options.language || 'en',
      limit: options.limit ?? 100,
    }];

    const response2 = await fetch(`${this.baseUrl}/dataforseo_labs/google/ranked_keywords/live`, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body2),
    });

    if (!response2.ok) {
      const text = await response2.text();
      throw new Error(`DataForSEO ranked keywords error ${response2.status}: ${text}`);
    }

    const data2 = await response2.json() as any;
    const task2 = data2.tasks?.[0];
    if (task2?.status_code !== 20000) throw new Error(`DataForSEO task failed: ${task2?.status_message}`);

    const items = task2.result?.[0]?.items || [];
    return items.map((item: any) => ({
      keyword: item.keyword_data?.keyword,
      searchVolume: item.keyword_data?.keyword_info?.search_volume ?? null,
      cpc: item.keyword_data?.keyword_info?.cpc ?? null,
      competition: item.keyword_data?.keyword_info?.competition ?? null,
      difficulty: item.keyword_data?.keyword_properties?.keyword_difficulty ?? null,
      provider: 'dataforseo',
    })).filter((k: any) => k.keyword);
  }
}

// SerpApi Provider (alternative)
export class SerpApiProvider implements SearchProvider {
  name = 'serpapi';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.SERPAPI_KEY || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  getStatus(): ProviderStatus {
    if (!this.isConfigured()) {
      return { configured: false, error: 'SERPAPI_KEY not set' };
    }
    return { configured: true };
  }

  async search(query: string, options: SearchOptions = {}): Promise<SerpResult> {
    if (!this.isConfigured()) throw new Error('SerpApi not configured');

    const params = new URLSearchParams({
      engine: options.engine || 'google',
      q: query,
      api_key: this.apiKey,
      gl: options.country?.toLowerCase() || 'us',
      hl: options.language || 'en',
      device: options.device || 'desktop',
    });

    const response = await fetch(`https://serpapi.com/search?${params.toString()}`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`SerpApi error ${response.status}: ${text}`);
    }

    const data = await response.json() as any;

    return {
      query,
      results: (data.organic_results || []).map((r: any) => ({
        position: r.position,
        url: r.link,
        title: r.title,
        description: r.snippet || '',
        domain: new URL(r.link).hostname,
      })),
      serpFeatures: Object.keys(data).filter(k => k.includes('_results') || k.includes('knowledge')),
      totalResults: data.search_information?.total_results,
      provider: 'serpapi',
      requestId: data.search_metadata?.id,
      timestamp: new Date().toISOString(),
    };
  }

  async getKeywords(): Promise<KeywordData[]> {
    throw new Error('SerpApi keywords not implemented — use DataForSEO for keywords');
  }

  async getBacklinks(): Promise<BacklinkData[]> {
    throw new Error('SerpApi backlinks not implemented — use DataForSEO for backlinks');
  }

  async getCompetitors(): Promise<string[]> {
    throw new Error('SerpApi competitors not implemented');
  }

  async getDomainKeywords(): Promise<KeywordData[]> {
    throw new Error('SerpApi domain keywords not implemented');
  }
}

// Provider Factory
export function createSearchProvider(preferred?: string): SearchProvider {
  const dataForSeo = new DataForSEOProvider();
  if (dataForSeo.isConfigured() && (!preferred || preferred === 'dataforseo')) {
    return dataForSeo;
  }

  const serpApi = new SerpApiProvider();
  if (serpApi.isConfigured() && (!preferred || preferred === 'serpapi')) {
    return serpApi;
  }

  // Return DataForSEO even if not configured — caller will check isConfigured()
  return dataForSeo;
}

export function getProviderStatus(): Record<string, ProviderStatus> {
  const dataForSeo = new DataForSEOProvider();
  const serpApi = new SerpApiProvider();
  
  return {
    dataforseo: dataForSeo.getStatus(),
    serpapi: serpApi.getStatus(),
    dataForSeo: dataForSeo.getStatus(), // alias for frontend
    openai: { configured: !!process.env.OPENAI_API_KEY },
    anthropic: { configured: !!process.env.ANTHROPIC_API_KEY },
    google: { configured: !!process.env.GOOGLE_AI_API_KEY },
    openrouter: { configured: !!process.env.OPENROUTER_API_KEY },
    perplexity: { configured: !!process.env.PERPLEXITY_API_KEY },
    googleSearchConsole: { configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) },
    googleAnalytics: { configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) },
    stripe: { configured: !!process.env.STRIPE_SECRET_KEY },
    s3: { configured: !!(process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY) },
  };
}
