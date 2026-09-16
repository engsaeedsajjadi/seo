/**
 * RankForge — AI Provider Abstraction
 * OpenAI, Anthropic, Google, OpenRouter, Perplexity
 * All operations metered for cost tracking
 */

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

export interface AIProvider {
  name: string;
  isConfigured(): boolean;
  complete(prompt: string, options?: AIOptions): Promise<AIResponse>;
}

// Token cost table (per 1k tokens, approximate)
const COST_TABLE: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  'default': { input: 0.001, output: 0.002 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = COST_TABLE[model] || COST_TABLE['default'];
  // Find closest match
  for (const key of Object.keys(COST_TABLE)) {
    if (model.includes(key)) {
      const c = COST_TABLE[key];
      return (inputTokens / 1000) * c.input + (outputTokens / 1000) * c.output;
    }
  }
  return (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;
}

function estimateTokens(text: string): number {
  // Rough: 1 token ~ 4 chars
  return Math.ceil(text.length / 4);
}

export class OpenAIProvider implements AIProvider {
  name = 'openai';
  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async complete(prompt: string, options: AIOptions = {}): Promise<AIResponse> {
    if (!this.isConfigured()) throw new Error('OpenAI not configured');

    const model = options.model || 'gpt-4o-mini';
    const start = Date.now();

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
          { role: 'user', content: prompt },
        ],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1000,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI error ${response.status}: ${text}`);
    }

    const data = await response.json() as any;
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

export class AnthropicProvider implements AIProvider {
  name = 'anthropic';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async complete(prompt: string, options: AIOptions = {}): Promise<AIResponse> {
    if (!this.isConfigured()) throw new Error('Anthropic not configured');

    const model = options.model || 'claude-3-5-sonnet-20241022';
    const start = Date.now();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens ?? 1000,
        system: options.systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic error ${response.status}: ${text}`);
    }

    const data = await response.json() as any;
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

export class GoogleAIProvider implements AIProvider {
  name = 'google';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GOOGLE_AI_API_KEY || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async complete(prompt: string, options: AIOptions = {}): Promise<AIResponse> {
    if (!this.isConfigured()) throw new Error('Google AI not configured');

    const model = options.model || 'gemini-1.5-flash';
    const start = Date.now();

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: options.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 1000,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google AI error ${response.status}: ${text}`);
    }

    const data = await response.json() as any;
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usage = data.usageMetadata || {};

    const inputTokens = usage.promptTokenCount ?? estimateTokens(prompt);
    const outputTokens = usage.candidatesTokenCount ?? estimateTokens(content);

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

export class OpenRouterProvider implements AIProvider {
  name = 'openrouter';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async complete(prompt: string, options: AIOptions = {}): Promise<AIResponse> {
    if (!this.isConfigured()) throw new Error('OpenRouter not configured');

    const model = options.model || 'openai/gpt-4o-mini';
    const start = Date.now();

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'https://rankforge.io',
        'X-Title': 'RankForge',
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
          { role: 'user', content: prompt },
        ],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1000,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter error ${response.status}: ${text}`);
    }

    const data = await response.json() as any;
    const choice = data.choices?.[0];
    const usage = data.usage || {};

    const inputTokens = usage.prompt_tokens ?? estimateTokens(prompt);
    const outputTokens = usage.completion_tokens ?? estimateTokens(choice?.message?.content || '');

    return {
      content: choice?.message?.content || '',
      model,
      provider: 'openrouter',
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCost(model, inputTokens, outputTokens),
      latencyMs: Date.now() - start,
      requestId: data.id,
    };
  }
}

export class PerplexityProvider implements AIProvider {
  name = 'perplexity';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.PERPLEXITY_API_KEY || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async complete(prompt: string, options: AIOptions = {}): Promise<AIResponse> {
    if (!this.isConfigured()) throw new Error('Perplexity not configured');

    const model = options.model || 'llama-3-sonar-small-32k-online';
    const start = Date.now();

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
          { role: 'user', content: prompt },
        ],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1000,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Perplexity error ${response.status}: ${text}`);
    }

    const data = await response.json() as any;
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

export function createAIProvider(preferred?: string): AIProvider {
  const providers: AIProvider[] = [
    new OpenAIProvider(),
    new AnthropicProvider(),
    new GoogleAIProvider(),
    new OpenRouterProvider(),
    new PerplexityProvider(),
  ];

  if (preferred) {
    const found = providers.find(p => p.name === preferred && p.isConfigured());
    if (found) return found;
  }

  const configured = providers.find(p => p.isConfigured());
  if (configured) return configured;

  // Return OpenAI even if not configured — caller checks isConfigured()
  return providers[0];
}

export function getAllAIProviders(): { name: string; configured: boolean }[] {
  return [
    new OpenAIProvider(),
    new AnthropicProvider(),
    new GoogleAIProvider(),
    new OpenRouterProvider(),
    new PerplexityProvider(),
  ].map(p => ({ name: p.name, configured: p.isConfigured() }));
}
