/**
 * Preload for tests/integration/worker-real.test.ts — MOCKS, NOT REAL SERVICES.
 * Replaces DNS and global fetch inside the real Worker process, so handlers run for
 * real against PostgreSQL while websites, DataForSEO, Google and OpenAI are simulated.
 * A pass here proves our handling and persistence, not a live provider integration.
 */
import { createHmac } from 'node:crypto';
import dns from 'node:dns/promises';
import { readFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const PUBLIC_IP = '93.184.216.34';
(dns as any).lookup = async (host: string) => [{ address: host.startsWith('rebind.') ? '10.0.0.5' : PUBLIC_IP, family: 4 }];
syncBuiltinESMExports();

const site = (name: string) => readFileSync(new URL(`../fixtures/site/${name}`, import.meta.url), 'utf8');
const html = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html' } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const dfs = (items: unknown[]) => json({ tasks: [{ status_code: 20000, id: 'mock', result: [{ items, item_types: ['organic'], se_results_count: 1 }] }] });

let flakyCalls = 0;
let hookCalls = 0;

(globalThis as any).fetch = async (input: string | URL, init?: any): Promise<Response> => {
  const url = new URL(String(input));
  const body = init?.body ? String(init.body) : '';

  if (url.hostname === 'fixture.rankforge.test') {
    const pages: Record<string, string> = { '/': 'index.html', '/about.html': 'about.html', '/products.html': 'products.html', '/contact.html': 'contact.html' };
    if (url.pathname === '/robots.txt') return new Response(site('robots.txt'), { headers: { 'content-type': 'text/plain' } });
    return pages[url.pathname] ? html(site(pages[url.pathname])) : html('<title>Not found</title>', 404);
  }
  if (url.hostname === 'untitled.rankforge.test') return html('<html><body><p>No title here</p></body></html>');
  if (url.hostname === 'flaky.rankforge.test') {
    if (url.pathname === '/robots.txt') return html('', 404);
    if (++flakyCalls === 1) throw new TypeError('fetch failed: simulated network error');
    return html('<html><head><title>Recovered</title></head><body><h1>Recovered</h1></body></html>');
  }
  if (url.hostname === 'down.rankforge.test') throw new TypeError('fetch failed: simulated outage');

  // First call fails to prove retry. Later calls verify the signature like a real receiver would.
  if (url.hostname === 'hooks.rankforge.test') {
    if (++hookCalls === 1) return new Response('busy', { status: 503 });
    const expected = `sha256=${createHmac('sha256', 'journey-secret-hash').update(body).digest('hex')}`;
    return new Response('ok', { status: init?.headers?.['x-seoyar-signature'] === expected ? 200 : 401 });
  }

  if (url.hostname === 'api.dataforseo.com') {
    if (url.pathname.includes('/serp/')) return dfs([{ type: 'organic', rank_group: 7, url: 'https://rank.rankforge.test/p', title: 't', domain: 'rank.rankforge.test' }]);
    if (url.pathname.includes('/backlinks/')) return dfs([{ domain_from: 'ref.test', url_from: 'https://ref.test/a', url_to: 'https://rank.rankforge.test/', anchor: 'x', first_seen: '2026-01-01 00:00:00 +00:00', domain_from_rank: 40, dofollow: true }]);
    if (url.pathname.includes('competitors_domain')) return dfs([{ domain: 'rival.test', avg_position: 4, intersections: 12 }]);
    if (url.pathname.includes('related_keywords')) return dfs([{ keyword: 'mock keyword', keyword_info: { search_volume: 900, cpc: 1.5, competition: 0.4 }, keyword_properties: { keyword_difficulty: 33 } }]);
  }
  if (url.hostname === 'oauth2.googleapis.com') return json({ access_token: 'REFRESHED-ACCESS-SECRET-MARKER', expires_in: 3600, token_type: 'Bearer' });
  if (url.hostname === 'searchconsole.googleapis.com') {
    return json({ rows: [{ keys: ['2026-10-01', 'mock query', 'https://rank.rankforge.test/', 'irn', 'DESKTOP'], clicks: 5, impressions: 50, ctr: 0.1, position: 3 }] });
  }
  if (url.hostname === 'analyticsdata.googleapis.com') {
    if (url.pathname.includes('properties/500')) return json({ error: { message: 'simulated outage' } }, 500);
    return json({ rows: [{ dimensionValues: [{ value: '20261001' }, { value: 'Organic Search' }], metricValues: [{ value: '10' }, { value: '8' }, { value: '1' }, { value: '30' }] }] });
  }
  if (url.hostname === 'www.googleapis.com') {
    return json({ lighthouseResult: { categories: { performance: { score: 0.9 }, accessibility: { score: 0.8 }, 'best-practices': { score: 0.7 }, seo: { score: 0.6 } }, audits: { 'largest-contentful-paint': { numericValue: 1200 }, 'cumulative-layout-shift': { numericValue: 0.01 } } } });
  }
  if (url.hostname === 'api.openai.com') {
    if (body.includes('FAIL-AI')) return json({ error: { message: 'simulated AI outage' } }, 500);
    if (body.includes('SEO editor for the website')) {
      const items = [...body.matchAll(/\\"i\\":(\d+),\\"url\\":\\"[^\\]*\\",\\"kind\\":\\"(meta_\w+)\\"/g)].map((m) => ({
        i: Number(m[1]),
        value: m[2] === 'meta_title' ? 'City tours for every family' : 'Book a city tour with a local guide, small groups and flexible times on every day of the week here.',
      }));
      return json({ model: 'mock-model', choices: [{ message: { content: JSON.stringify(items) } }], usage: { prompt_tokens: 11, completion_tokens: 22 } });
    }
    if (body.includes('experienced SEO writer')) {
      // A Markdown article with a stray HTML tag and a fence, which the worker must strip.
      const paragraph = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
      const article = ['```markdown', '# Title the worker drops', '## Intro', `${paragraph} <script>alert(1)</script>`, '', '- first point', '- **second** point', '', '## FAQ', paragraph, paragraph, '```'].join('\n');
      return json({ model: 'mock-model', choices: [{ message: { content: article } }], usage: { prompt_tokens: 11, completion_tokens: 222 } });
    }
    return json({ model: 'mock-model', choices: [{ message: { content: '{"sections":[{"heading":"Intro"}]}' } }], usage: { prompt_tokens: 11, completion_tokens: 22 } });
  }
  throw new Error(`Unmocked outbound request: ${url.hostname}`);
};
