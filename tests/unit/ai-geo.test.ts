/**
 * RankForge — AI worker wiring (GEO + CONTENT_BRIEF): unit tests
 * Proves, with pure functions and mocked HTTP:
 *  - GEO analysis derives mention/position/citations ONLY from the
 *    provider's actual response text and the project's real domain
 *    and competitor list (position = order of first appearance)
 *  - brief outline parsing keeps the model's JSON when it complies
 *    and stores raw text (marked) when it doesn't — never a
 *    locally fabricated structure
 *  - an unconfigured provider rejects BEFORE any HTTP call
 *  - a mocked OpenAI completion returns the shared AIResponse shape
 */

import assert from 'assert';
import {
  OpenAIProvider,
  createAiProviders,
  pickAiProvider,
  aiEngineForProvider,
  analyzeGeoResponse,
  extractUrlsFromText,
  buildBriefPrompt,
  parseBriefOutline,
} from '../../apps/worker/src/ai.js';

console.log('Testing AI worker module (GEO analysis, brief parsing, providers)...');

// ---------- GEO analysis ----------
{
  const response = [
    'For business websites, many teams start with competitor-one.com because of its templates.',
    'Another solid option is https://example.com/ which offers a generous free tier.',
    'You can also compare plans at https://rival-two.net/pricing and example.com side by side.',
  ].join('\n');

  const analysis = analyzeGeoResponse(response, {
    domain: 'example.com',
    projectName: 'Example Project',
    competitorDomains: ['competitor-one.com', 'rival-two.net', 'absent-competitor.com'],
  });

  assert.strictEqual(analysis.brandMentioned, true);
  // Domain order of appearance: competitor-one.com (sentence 1), example.com (sentence 2 URL) → position 2
  assert.strictEqual(analysis.brandPosition, 2);
  assert.strictEqual(analysis.visibilityScore, 50, 'documented derivation: round(100 / brandPosition)');
  assert.deepStrictEqual(analysis.citedUrls, ['https://example.com/', 'https://rival-two.net/pricing']);
  assert.strictEqual(analysis.competitorMentions['competitor-one.com'], 1);
  assert.strictEqual(analysis.competitorMentions['rival-two.net'], 1);
  assert.strictEqual(analysis.competitorMentions['absent-competitor.com'], undefined, 'unmentioned competitors are absent, not zero-filled');

  const noMention = analyzeGeoResponse('Try competitor-one.com for this.', {
    domain: 'example.com',
    competitorDomains: ['competitor-one.com'],
  });
  assert.strictEqual(noMention.brandMentioned, false);
  assert.strictEqual(noMention.brandPosition, null);
  assert.strictEqual(noMention.visibilityScore, 0);
  console.log('  ✓ GEO analysis from real response text');
}

// ---------- Brief outline parsing ----------
{
  const good = parseBriefOutline('```json\n{"sections":[{"heading":"Intro","subheadings":[],"keyPoints":[],"targetWordCount":300}],"metaTitle":"T"}\n```');
  assert.strictEqual(good.parsed, true);
  assert.strictEqual(good.outline.sections.length, 1);

  const bad = parseBriefOutline('Here is your outline: 1. Introduction 2. Body');
  assert.strictEqual(bad.parsed, false);
  assert.strictEqual(bad.outline.parseError, true);
  assert.ok(bad.outline.rawText.includes('Introduction'), 'raw model text is preserved, not restructured');
  assert.deepStrictEqual(bad.outline.sections, []);

  const prompt = buildBriefPrompt({ title: 'Best Widgets', targetKeyword: 'widgets', targetWordCount: 1500, language: 'fa', projectDomain: 'example.com' });
  assert.ok(prompt.includes('Best Widgets') && prompt.includes('widgets') && prompt.includes('STRICT JSON'));
  console.log('  ✓ brief prompt + outline parsing (no fabrication)');
}

// ---------- Providers ----------
{
  // Unconfigured: pickAiProvider returns null; complete() rejects before any HTTP call.
  let httpCalls = 0;
  const fetchSpy = async () => { httpCalls++; throw new Error('must not be called'); };
  const providers = createAiProviders({}, fetchSpy as any);
  assert.strictEqual(pickAiProvider(providers), null);
  await assert.rejects(() => providers[0].complete('hello'), /not configured/);
  assert.strictEqual(httpCalls, 0, 'no HTTP call may happen without a key');

  // Mocked OpenAI completion → shared AIResponse shape.
  const openAiFixture = {
    id: 'chatcmpl-fixture',
    choices: [{ message: { content: 'Example answer mentioning example.com' } }],
    usage: { prompt_tokens: 12, completion_tokens: 6 },
  };
  const calls: any[] = [];
  const mockFetch = async (url: string, init: any) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => openAiFixture, text: async () => JSON.stringify(openAiFixture) };
  };
  const openai = new OpenAIProvider('sk-fixture', mockFetch as any);
  const res = await openai.complete('What is example.com?', { maxTokens: 100 });
  assert.strictEqual(calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.strictEqual(calls[0].init.headers.Authorization, 'Bearer sk-fixture');
  assert.strictEqual(res.content, 'Example answer mentioning example.com');
  assert.strictEqual(res.provider, 'openai');
  assert.strictEqual(res.model, 'gpt-4o-mini');
  assert.strictEqual(res.inputTokens, 12);
  assert.ok(res.estimatedCostUsd > 0);

  // Provider HTTP errors carry their status (handlers map 401 → non-retryable).
  const failingFetch = async () => ({ ok: false, status: 401, text: async () => 'Invalid API key', json: async () => ({}) });
  const failing = new OpenAIProvider('sk-bad', failingFetch as any);
  await assert.rejects(
    () => failing.complete('hi'),
    (e: any) => e.httpStatus === 401 && /OpenAI error 401/.test(e.message),
  );

  assert.strictEqual(aiEngineForProvider('google'), 'google');
  assert.strictEqual(aiEngineForProvider('anthropic'), 'anthropic');
  console.log('  ✓ AI providers: gating, request shape, error status');
}

console.log('✅ ai-geo.test.ts — all assertions passed');
