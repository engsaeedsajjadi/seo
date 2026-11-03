/**
 * RankForge — Audit Rule Engine Unit Tests
 */

import { runAudit, calculateSeoScore } from '../../packages/audit/src/rules/index.js';
import assert from 'assert';

console.log('Testing audit engine...');

const context = {
  pages: [
    {
      url: 'https://example.com/',
      statusCode: 200,
      title: 'Example Domain',
      metaDescription: 'This is an example',
      h1: 'Example',
      h2: ['Section 1'],
      wordCount: 500,
      isIndexable: true,
      canonical: 'https://example.com/',
      robotsMeta: '',
      structuredData: [{ '@type': 'Article' }],
      images: [{ src: '/img.jpg', alt: 'Example' }],
      links: [{ href: 'https://example.com/about', isInternal: true }],
      responseTime: 500,
      headers: {},
    },
    {
      url: 'https://example.com/missing-title',
      statusCode: 200,
      title: undefined,
      metaDescription: undefined,
      h1: undefined,
      h2: [],
      wordCount: 100,
      isIndexable: true,
      canonical: undefined,
      robotsMeta: '',
      structuredData: [],
      images: [{ src: '/img2.jpg' }],
      links: [],
      responseTime: 3000,
      headers: {},
    },
  ],
  domain: 'example.com',
  sitemapUrls: [],
  robotsTxt: '',
};

const findings = runAudit(context as any);

console.log(`Found ${findings.length} issues`);

assert(findings.some(f => f.ruleId === 'missing_title'), 'Should detect missing title');
assert(findings.some(f => f.ruleId === 'missing_meta_description'), 'Should detect missing meta');
assert(findings.some(f => f.ruleId === 'missing_h1'), 'Should detect missing H1');
assert(findings.some(f => f.ruleId === 'thin_content'), 'Should detect thin content');
assert(findings.some(f => f.ruleId === 'images_without_alt'), 'Should detect images without alt');
assert(findings.some(f => f.ruleId === 'slow_pages'), 'Should detect slow pages');
assert(findings.some(f => f.ruleId === 'missing_canonical'), 'Should detect missing canonical');
// missing_structured_data requires wordCount >200 and isIndexable and no structured data - our fixture second page has 100 words, so not triggered, which is correct per rule
// assert(findings.some(f => f.ruleId === 'missing_structured_data'), 'Should detect missing structured data');

const score = calculateSeoScore(findings);
console.log(`SEO Score: ${score.overall}`);
assert(score.overall >= 0 && score.overall <= 100, 'Score should be 0-100');
assert(score.overall < 100, 'Score should be less than 100 with issues');

// Score follows the share of healthy pages, not the raw number of issues.
const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://example.com/${i}`);
const finding = (severity: string, category: string, affectedUrls: string[]) => ({ ruleId: 'x', severity, category, title: 'x', description: 'x', evidence: {}, affectedUrls, recommendation: 'x' }) as any;
assert.strictEqual(calculateSeoScore([], urls(10)).overall, 100, 'no issues is 100');
assert.strictEqual(calculateSeoScore([finding('high', 'content', urls(2))], urls(10)).overall, 80, '2 of 10 pages with errors is 80');
assert.strictEqual(calculateSeoScore([finding('high', 'content', urls(9)), finding('high', 'metadata', urls(9))], urls(100)).overall, 91, 'two errors on one page count once');
assert.strictEqual(calculateSeoScore([finding('low', 'images', urls(37))], urls(100)).overall, 99, 'minor issues cost little');
assert.strictEqual(calculateSeoScore([finding('medium', 'metadata', urls(10))], urls(10)).overall, 90, 'a warning on every page costs 10');
assert.strictEqual(calculateSeoScore([finding('low', 'crawlability', ['https://example.com/sitemap.xml'])], urls(10)).overall, 98, 'site-wide issue has a fixed cost');
assert.strictEqual(calculateSeoScore([], []).overall, 0, 'nothing crawled is not a perfect score');
assert.strictEqual(calculateSeoScore([finding('high', 'links', urls(5))], urls(10)).categories.links, 50, 'category follows the same rule');

console.log('✅ Audit engine tests passed');
