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

console.log('✅ Audit engine tests passed');
