/**
 * RankForge — Worker AI provider integration
 *
 * AI_VISIBILITY_CHECK (GEO) and CONTENT_BRIEF handlers live in the
 * worker, but the only AI provider abstraction in the repo —
 * apps/api/src/lib/ai-providers.ts — belongs to the API app and
 * cannot be imported across the standalone worker build. This module
 * mirrors that abstraction (same endpoints, default models, cost
 * table, response shape) the same way dataforseo.ts mirrors the API
 * lib's DataForSEO client.
 *
 * Honesty rules, same as the rest of the worker:
 * - No configured provider → callers fail the job with
 *   PROVIDER_NOT_CONFIGURED. Nothing is ever generated locally,
 *   mocked, or stored as if an AI had produced it.
 * - Everything an AI actually returns is stored raw (geo_runs.
 *   raw_response / content_briefs.outline) alongside the derived
 *   analysis, and every call is metered in ai_usage.
 */

import { normalizeDomainForMatch, type QueryFn } from './dataforseo.js';

// ============================================================
// PROVIDERS — mirror apps/api/src/lib/ai-providers.ts
// ============================================================

export type FetchFn = (url: string, init?: any) => Promise<any>;

export interface AIOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface AIResponse {
  content: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  requestId?: string;
}

const AI_REQUEST_TIMEOUT_MS = 90_000;

export class AiProviderError extends Error {
  httpStatus?: number;
  constructor(message: string, opts: { httpStatus?: number } = {}) {
    super(message);
    this.name = 'AiProviderError';
    this.httpStatus = opts.httpStatus;
  }
}

/** An exhausted provider account stays exhausted, so retrying only repeats the failure. */
export function isAiQuotaError(error: unknown): boolean {
  return error instanceof AiProviderError
    && /insufficient_quota|credit_balance|billing_hard_limit|credit balance is too low/i.test(error.message);
}

export interface AIProvider {
  name: string;
  isConfigured(): boolean;
  complete(prompt: string, options?: AIOptions): Promise<AIResponse>;
}

// Token cost table (per 1k tokens, approximate) — identical to the API lib.
const COST_TABLE: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  // Standard price from January 2027, so the estimate is not below the real cost.
  'gemini-3.8-flash': { input: 0.0015, output: 0.0075 },
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  'default': { input: 0.001, output: 0.002 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = COST_TABLE[model] || COST_TABLE['default'];
  for (const key of Object.keys(COST_TABLE)) {
    if (model.includes(key)) {
      const c = COST_TABLE[key];
      return (inputTokens / 1000) * c.input + (outputTokens / 1000) * c.output;
    }
  }
  return (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

abstract class BaseAiProvider implements AIProvider {
  abstract name: string;
  protected fetchFn: FetchFn;
  constructor(protected apiKey: string, fetchFn?: FetchFn) {
    this.fetchFn = fetchFn || ((url: string, init?: any) => fetch(url, init));
  }
  isConfigured(): boolean {
    return !!this.apiKey;
  }
  abstract complete(prompt: string, options?: AIOptions): Promise<AIResponse>;

  protected async postJson(url: string, headers: Record<string, string>, body: any, label: string): Promise<any> {
    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      // A stalled provider must not hold a worker slot until the job limit.
      signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new AiProviderError(`${label} error ${response.status}: ${text}`, { httpStatus: response.status });
    }
    return response.json();
  }
}

export class OpenAIProvider extends BaseAiProvider {
  name = 'openai';
  private baseUrl = 'https://api.openai.com/v1';

  async complete(prompt: string, options: AIOptions = {}): Promise<AIResponse> {
    if (!this.isConfigured()) throw new AiProviderError('OpenAI not configured');
    const model = options.model || 'gpt-4o-mini';
    const start = Date.now();
    const data = await this.postJson(`${this.baseUrl}/chat/completions`, {
      'Authorization': `Bearer ${this.apiKey}`,
    }, {
      model,
      messages: [
        ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
        { role: 'user', content: prompt },
      ],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1000,
    }, 'OpenAI');

    const choice = data.choices?.[0];
    const usage = data.usage || {};
    const inputTokens = usage.prompt_tokens ?? estimateTokens(prompt);
    const outputTokens = usage.completion_tokens ?? estimateTokens(choice?.message?.content || '');
    return {
      content: choice?.message?.content || '',
      model,
      provider: 'openai',
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCost(model, inputTokens, outputTokens),
      latencyMs: Date.now() - start,
      requestId: data.id,
    };
  }
}

export class AnthropicProvider extends BaseAiProvider {
  name = 'anthropic';

  async complete(prompt: string, options: AIOptions = {}): Promise<AIResponse> {
    if (!this.isConfigured()) throw new AiProviderError('Anthropic not configured');
    const model = options.model || 'claude-3-5-sonnet-20241022';
    const start = Date.now();
    const data = await this.postJson('https://api.anthropic.com/v1/messages', {
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    }, {
      model,
      max_tokens: options.maxTokens ?? 1000,
      system: options.systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature ?? 0.7,
    }, 'Anthropic');

    const content = data.content?.[0]?.text || '';
    const usage = data.usage || {};
    const inputTokens = usage.input_tokens ?? estimateTokens(prompt);
    const outputTokens = usage.output_tokens ?? estimateTokens(content);
    return {
      content,
      model,
      provider: 'anthropic',
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCost(model, inputTokens, outputTokens),
      latencyMs: Date.now() - start,
      requestId: data.id,
    };
  }
}

const GEMINI_THINKING_ALLOWANCE = 2000;

export class GoogleAIProvider extends BaseAiProvider {
  name = 'google';

  async complete(prompt: string, options: AIOptions = {}): Promise<AIResponse> {
    if (!this.isConfigured()) throw new AiProviderError('Google AI not configured');
    const model = options.model || process.env.GOOGLE_AI_MODEL || 'gemini-3.5-flash-lite';
    // Gemini 3 rejects sampling settings, and its thinking tokens count against the output limit.
    const isGemini3 = !/^gemini-[12]\./.test(model);
    const maxOutputTokens = options.maxTokens ?? 1000;
    const start = Date.now();
    const data = await this.postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { 'x-goog-api-key': this.apiKey },
      {
        contents: [{ parts: [{ text: options.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt }] }],
        generationConfig: {
          ...(isGemini3
            ? { maxOutputTokens: maxOutputTokens + GEMINI_THINKING_ALLOWANCE, thinkingConfig: { thinkingLevel: 'low' } }
            : { temperature: options.temperature ?? 0.7, maxOutputTokens }),
        },
      },
      'Google AI',
    );

    // A reply can arrive in several parts; reading only the first one cuts the text mid-sentence.
    const content = (data.candidates?.[0]?.content?.parts ?? [])
      .filter((part: any) => !part?.thought && typeof part?.text === 'string')
      .map((part: any) => part.text).join('');
    if (!content) throw new AiProviderError(`Google AI returned no text (${data.candidates?.[0]?.finishReason || 'unknown'})`);
    const usage = data.usageMetadata || {};
    const inputTokens = usage.promptTokenCount ?? estimateTokens(prompt);
    const outputTokens = (usage.candidatesTokenCount ?? estimateTokens(content)) + (usage.thoughtsTokenCount ?? 0);
    return {
      content,
      model,
      provider: 'google',
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCost(model, inputTokens, outputTokens),
      latencyMs: Date.now() - start,
    };
  }
}

export class PerplexityProvider extends BaseAiProvider {
  name = 'perplexity';

  async complete(prompt: string, options: AIOptions = {}): Promise<AIResponse> {
    if (!this.isConfigured()) throw new AiProviderError('Perplexity not configured');
    const model = options.model || 'llama-3-sonar-small-32k-online';
    const start = Date.now();
    const data = await this.postJson('https://api.perplexity.ai/chat/completions', {
      'Authorization': `Bearer ${this.apiKey}`,
    }, {
      model,
      messages: [
        ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
        { role: 'user', content: prompt },
      ],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1000,
    }, 'Perplexity');

    const choice = data.choices?.[0];
    const usage = data.usage || {};
    const inputTokens = usage.prompt_tokens ?? estimateTokens(prompt);
    const outputTokens = usage.completion_tokens ?? estimateTokens(choice?.message?.content || '');
    return {
      content: choice?.message?.content || '',
      model,
      provider: 'perplexity',
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCost(model, inputTokens, outputTokens),
      latencyMs: Date.now() - start,
      requestId: data.id,
    };
  }
}

export interface AiProviderKeys {
  openai?: string;
  anthropic?: string;
  googleAi?: string;
  perplexity?: string;
}

/** All worker AI providers in the API lib's preference order (minus OpenRouter, which the worker never had keys for). */
export function createAiProviders(keys: AiProviderKeys, fetchFn?: FetchFn): AIProvider[] {
  return [
    new OpenAIProvider(keys.openai || '', fetchFn),
    new AnthropicProvider(keys.anthropic || '', fetchFn),
    new GoogleAIProvider(keys.googleAi || '', fetchFn),
    new PerplexityProvider(keys.perplexity || '', fetchFn),
  ];
}

/** First configured provider, honoring an explicit preference by name. Returns null when none is configured. */
export function pickAiProvider(providers: AIProvider[], preferred?: string): AIProvider | null {
  if (preferred) {
    const found = providers.find((p) => p.name === preferred && p.isConfigured());
    if (found) return found;
  }
  return providers.find((p) => p.isConfigured()) || null;
}

/**
 * Use the first working provider. An account without credit or with a rejected key cannot
 * succeed on retry, so the next configured provider is tried. Other errors surface as they are.
 */
export async function completeWithFallback(
  providers: AIProvider[],
  preferred: string | undefined,
  prompt: string,
  options: AIOptions,
): Promise<{ ai: AIResponse; provider: AIProvider }> {
  const first = pickAiProvider(providers, preferred);
  const ordered = [first, ...providers.filter((p) => p !== first && p.isConfigured())].filter(Boolean) as AIProvider[];
  let lastError: unknown = new AiProviderError('No AI provider configured');
  for (const provider of ordered) {
    try {
      return { ai: await provider.complete(prompt, options), provider };
    } catch (error) {
      lastError = error;
      const accountProblem = isAiQuotaError(error) || (error instanceof AiProviderError && (error.httpStatus === 401 || error.httpStatus === 403 || error.httpStatus === 404 || /location is not supported/i.test(error.message)));
      if (!accountProblem) throw error;
    }
  }
  throw lastError;
}

/** geo_runs.ai_engine values allowed by the schema CHECK. */
export function aiEngineForProvider(providerName: string): string {
  switch (providerName) {
    case 'openai': return 'openai';
    case 'anthropic': return 'anthropic';
    case 'google': return 'google';
    case 'perplexity': return 'perplexity';
    default: return 'openai';
  }
}

// ============================================================
// GEO ANALYSIS — pure functions over a real AI response.
// Nothing here invents an answer: inputs are the provider's own
// response text plus the project's real domain/competitor list.
// ============================================================

export function extractUrlsFromText(content: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const re = /https?:\/\/[^\s<>\])}"']+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content || '')) !== null) {
    const url = m[0].replace(/[.,;:!?]+$/, '');
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

export interface GeoAnalysis {
  brandMentioned: boolean;
  /** 1-based rank of the project domain among distinct domains appearing in the response (URLs first, then bare mentions), or null when absent. */
  brandPosition: number | null;
  citedUrls: string[];
  /** {competitorDomain: mentionCount} — only competitors actually mentioned. */
  competitorMentions: Record<string, number>;
  /** Deterministic derivation, NOT a provider metric: mentioned ? round(100 / brandPosition) : 0. */
  visibilityScore: number;
}

export function analyzeGeoResponse(
  content: string,
  opts: { domain: string; projectName?: string; competitorDomains?: string[] },
): GeoAnalysis {
  const text = content || '';
  const lower = text.toLowerCase();
  const own = normalizeDomainForMatch(opts.domain);

  const citedUrls = extractUrlsFromText(text);

  // Ordered distinct domains by TRUE first appearance in the text:
  // each candidate domain (from a cited URL or a bare mention) is
  // ranked by the character offset of its earliest occurrence.
  const firstSeenAt = new Map<string, number>();
  const noteDomain = (d: string, at: number) => {
    if (!d) return;
    const prev = firstSeenAt.get(d);
    if (prev === undefined || at < prev) firstSeenAt.set(d, at);
  };
  for (const url of citedUrls) {
    try {
      noteDomain(normalizeDomainForMatch(new URL(url).hostname), lower.indexOf(url.toLowerCase()));
    } catch { /* malformed URL in model text — ignore */ }
  }
  const bareRe = /\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|ai|dev|app|ir|uk|de|fr|es|it|nl|ca|au|info|biz|me|tv|us)\b/gi;
  let bm: RegExpExecArray | null;
  while ((bm = bareRe.exec(lower)) !== null) {
    noteDomain(normalizeDomainForMatch(bm[0]), bm.index);
  }
  const ordered = [...firstSeenAt.entries()].sort((a, b) => a[1] - b[1]).map(([d]) => d);

  const domainMentioned = !!own && lower.includes(own);
  const nameMentioned = !!opts.projectName && opts.projectName.trim().length >= 3 && lower.includes(opts.projectName.trim().toLowerCase());
  const brandMentioned = domainMentioned || nameMentioned;

  let brandPosition: number | null = null;
  if (own) {
    const idx = ordered.indexOf(own);
    if (idx >= 0) brandPosition = idx + 1;
    else if (brandMentioned) brandPosition = ordered.length + 1; // mentioned by name only, after every linked domain
  }

  const competitorMentions: Record<string, number> = {};
  for (const raw of opts.competitorDomains || []) {
    const comp = normalizeDomainForMatch(raw);
    if (!comp || comp === own) continue;
    const count = lower.split(comp).length - 1;
    if (count > 0) competitorMentions[comp] = count;
  }

  return {
    brandMentioned,
    brandPosition,
    citedUrls,
    competitorMentions,
    visibilityScore: brandMentioned && brandPosition ? Math.round(100 / brandPosition) : 0,
  };
}

// ============================================================
// CONTENT BRIEF — prompt construction + outline parsing.
// The outline stored in content_briefs.outline is the model's own
// output: parsed JSON when the model complied, otherwise the raw
// text (clearly marked) — never a locally fabricated structure.
// ============================================================

export const BRIEF_PROMPT_VERSION = 'worker-brief-v1';

export interface BriefInput {
  title: string;
  targetKeyword?: string | null;
  contentType?: string | null;
  targetWordCount?: number | null;
  language?: string | null;
  projectDomain?: string | null;
}

export function buildBriefPrompt(brief: BriefInput): string {
  const lines = [
    'You are an SEO content strategist. Produce a content brief outline as STRICT JSON only — no markdown fences, no commentary.',
    'JSON shape: {"sections":[{"heading":"...","subheadings":["..."],"keyPoints":["..."],"targetWordCount":0}],"metaTitle":"...","metaDescription":"...","faqQuestions":["..."]}',
    '',
    `Article title: ${brief.title}`,
  ];
  if (brief.targetKeyword) lines.push(`Target keyword: ${brief.targetKeyword}`);
  if (brief.contentType) lines.push(`Content type: ${brief.contentType}`);
  if (brief.targetWordCount) lines.push(`Target total word count: ${brief.targetWordCount}`);
  if (brief.projectDomain) lines.push(`Website: ${brief.projectDomain}`);
  // Every string a person reads must be in the article's language — models otherwise answer the key points in English.
  lines.push(`Write every text value (headings, subheadings, keyPoints, metaTitle, metaDescription, faqQuestions) in ${brief.language ? `this language: ${brief.language}` : 'the same language as the article title'}. Keep only the JSON keys in English.`);
  lines.push('Base every section on the title and keyword above. Do not invent statistics, studies, or facts.');
  return lines.join('\n');
}

export function parseBriefOutline(content: string): { outline: any; parsed: boolean } {
  const text = (content || '').trim();
  const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const obj = JSON.parse(unfenced);
    if (obj && typeof obj === 'object' && Array.isArray(obj.sections)) {
      return { outline: obj, parsed: true };
    }
  } catch { /* fall through to raw storage */ }
  return { outline: { sections: [], rawText: text, parseError: true }, parsed: false };
}

// ============================================================
// COST METERING — ai_usage rows, one per job (idempotency_key).
// ============================================================

export interface AiUsageInput {
  organizationId: string;
  projectId?: string | null;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  operation: string;
  idempotencyKey: string;
  referenceType: string;
  referenceId: string;
}

export async function recordAiUsage(queryFn: QueryFn, input: AiUsageInput): Promise<void> {
  await queryFn(
    `INSERT INTO ai_usage (organization_id, project_id, provider, model, input_tokens, output_tokens, estimated_cost_usd, operation, idempotency_key, reference_type, reference_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      input.organizationId, input.projectId || null, input.provider, input.model,
      input.inputTokens, input.outputTokens, input.estimatedCostUsd,
      input.operation, input.idempotencyKey, input.referenceType, input.referenceId,
    ],
  );
}

// ============================================================
// Site fix suggestions — titles and meta descriptions the WordPress plugin can apply
// ============================================================

export const FIX_PROMPT_VERSION = 'worker-fix-v1';
export type FixKind = 'meta_title' | 'meta_description';
export interface FixCandidate { url: string; kind: FixKind; title: string | null; h1: string | null; metaDescription: string | null; reason: string }
export interface FixSuggestion { url: string; kind: FixKind; value: string }

export const FIX_LIMITS: Record<FixKind, { min: number; max: number }> = {
  meta_title: { min: 15, max: 65 },
  meta_description: { min: 70, max: 165 },
};

export function buildFixPrompt(candidates: FixCandidate[], language: string | null | undefined, domain: string): string {
  const persian = (language ?? 'fa') === 'fa';
  const rows = candidates.map((c, i) => JSON.stringify({
    i, url: c.url, kind: c.kind, reason: c.reason, title: c.title ?? '', h1: c.h1 ?? '', description: c.metaDescription ?? '',
  })).join('\n');
  return [
    `You are an SEO editor for the website ${domain}.`,
    `Write a replacement for each item below, in ${persian ? 'Persian (Farsi)' : 'the language of the page'}.`,
    `- kind "meta_title": a unique page title of ${FIX_LIMITS.meta_title.min}-60 characters that says what the page offers.`,
    `- kind "meta_description": a description of ${FIX_LIMITS.meta_description.min}-155 characters that invites the click.`,
    'Use only facts present in the item. Do not invent prices, dates, discounts or claims. No quotes or emoji.',
    'Return only a JSON array: [{"i": <number>, "value": "<text>"}].',
    '',
    rows,
  ].join('\n');
}

/** Keeps only answers that match a requested item and fit its length limits. */
export function parseFixSuggestions(content: string, candidates: FixCandidate[]): FixSuggestion[] {
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let items: unknown;
  try { items = JSON.parse(match[0]); } catch { return []; }
  if (!Array.isArray(items)) return [];
  const out: FixSuggestion[] = [];
  const seen = new Set<number>();
  for (const item of items) {
    const i = Number((item as any)?.i);
    const value = String((item as any)?.value ?? '').replace(/\s+/g, ' ').replace(/^["'«]+|["'»]+$/g, '').trim();
    const candidate = candidates[i];
    if (!candidate || seen.has(i)) continue;
    const limits = FIX_LIMITS[candidate.kind];
    if (value.length < limits.min || value.length > limits.max) continue;
    if (/<|>/.test(value)) continue;
    seen.add(i);
    out.push({ url: candidate.url, kind: candidate.kind, value });
  }
  return out;
}

/** Pages from one crawl that need a new title or description, most important first. */
export function selectFixCandidates(
  pages: { url: string; title: string | null; h1: string | null; meta_description: string | null }[],
  openFixes: Set<string>,
  limit = 20,
): FixCandidate[] {
  const byTitle = new Map<string, number>();
  for (const p of pages) if (p.title) byTitle.set(p.title.trim(), (byTitle.get(p.title.trim()) ?? 0) + 1);
  const out: FixCandidate[] = [];
  const push = (c: FixCandidate) => { if (!openFixes.has(`${c.kind}|${c.url}`) && out.length < limit) out.push(c); };
  for (const p of pages) {
    const base = { url: p.url, title: p.title, h1: p.h1, metaDescription: p.meta_description };
    if (!p.meta_description?.trim()) push({ ...base, kind: 'meta_description', reason: 'missing description' });
  }
  for (const p of pages) {
    const base = { url: p.url, title: p.title, h1: p.h1, metaDescription: p.meta_description };
    const title = p.title?.trim() ?? '';
    if (!title) push({ ...base, kind: 'meta_title', reason: 'missing title' });
    else if ((byTitle.get(title) ?? 0) > 1) push({ ...base, kind: 'meta_title', reason: 'title used by another page' });
    else if (title.length > 65) push({ ...base, kind: 'meta_title', reason: 'title too long' });
  }
  return out;
}

// ============================================================
// ARTICLE DRAFTS — a full article from a completed brief. A person
// edits it and decides when it goes to WordPress (as a draft post).
// ============================================================

export const DRAFT_PROMPT_VERSION = 'worker-draft-v1';

export interface DraftInput {
  title: string;
  targetKeyword?: string | null;
  targetWordCount?: number | null;
  language?: string | null;
  outline: any;
}

export function buildDraftPrompt(input: DraftInput): string {
  const sections = Array.isArray(input.outline?.sections) ? input.outline.sections : [];
  const words = Math.min(4000, Math.max(600, Number(input.targetWordCount) || 1200));
  const lines = [
    'You are an experienced SEO writer. Write the full article below in Markdown only: "## " and "### " headings,',
    'paragraphs, "- " or "1. " lists and **bold**. No title line (the title is set separately), no HTML, no tables,',
    'no images, no links, no code fences, no notes to the editor.',
    `Language: ${input.language || 'fa'} — write naturally for native readers of that language.`,
    `Article title: ${input.title}`,
  ];
  if (input.targetKeyword) lines.push(`Main keyword: ${input.targetKeyword} — use it in the first paragraph and a few times naturally, never stuffed.`);
  lines.push(`Length: about ${words} words.`);
  lines.push('Follow this outline in order (headings may be lightly rephrased):');
  for (const s of sections.slice(0, 20)) {
    lines.push(`- ${String(s?.heading ?? '').slice(0, 200)}`);
    for (const sub of (Array.isArray(s?.subheadings) ? s.subheadings : []).slice(0, 8)) lines.push(`  - ${String(sub).slice(0, 200)}`);
    for (const p of (Array.isArray(s?.keyPoints) ? s.keyPoints : []).slice(0, 8)) lines.push(`  * cover: ${String(p).slice(0, 300)}`);
  }
  const faq = Array.isArray(input.outline?.faqQuestions) ? input.outline.faqQuestions.slice(0, 8) : [];
  if (faq.length) lines.push(`End with a "## " FAQ section answering: ${faq.map((q: unknown) => String(q).slice(0, 200)).join(' | ')}`);
  lines.push('Be accurate and practical. Do not invent statistics, prices, studies, quotes, dates or company facts; when a number is needed, describe it in general terms.');
  return lines.join('\n');
}

/** Markdown the editor and the WordPress post can trust: fences and any HTML removed, size bounded. */
export function cleanDraft(content: string): { markdown: string; words: number } {
  const markdown = (content || '')
    .replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```\s*$/, '')
    .replace(/<[^>]*>/g, '')
    .replace(/^#\s+.*\n+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 100000);
  const words = markdown.replace(/[#*\-_>`]/g, ' ').split(/\s+/).filter(Boolean).length;
  return { markdown, words };
}
