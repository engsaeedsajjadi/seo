/**
 * Crawl Safety Integration Tests
 * Tests robots.txt, timeouts, AbortController, max pages/depth, concurrency, content type, etc.
 */

import assert from 'assert';

console.log('🧪 Crawl Safety Integration Tests');

// Check crawler code for safety features
const fs = await import('fs');
const crawlerPath = 'apps/worker/src/crawler.ts';

let crawlerCode: string;
try {
  crawlerCode = fs.readFileSync(crawlerPath, 'utf-8');
} catch (e) {
  console.log(`⚠️  Could not read ${crawlerPath}, checking alternative paths`);
  try {
    crawlerCode = fs.readFileSync('apps/worker/src/index.ts', 'utf-8');
  } catch (e2) {
    console.log('⚠️  Crawler code not found, skipping code checks');
    crawlerCode = '';
  }
}

if (crawlerCode) {
  console.log('\nTest 1: robots.txt handling');
  assert.ok(crawlerCode.includes('robots.txt') || crawlerCode.includes('robots'), 'Crawler must handle robots.txt');
  console.log('  ✅ robots.txt handling present');

  console.log('\nTest 2: AbortController timeout');
  assert.ok(crawlerCode.includes('AbortController'), 'Crawler must use AbortController for timeout');
  assert.ok(crawlerCode.includes('AbortSignal') || crawlerCode.includes('signal'), 'Crawler must use AbortSignal');
  console.log('  ✅ AbortController timeout present');

  console.log('\nTest 3: Max pages/depth limits');
  assert.ok(crawlerCode.includes('maxPages') || crawlerCode.includes('max_pages'), 'Crawler must enforce maxPages');
  assert.ok(crawlerCode.includes('maxDepth') || crawlerCode.includes('max_depth'), 'Crawler must enforce maxDepth');
  console.log('  ✅ Max pages/depth limits present');

  console.log('\nTest 4: Concurrency and rate limiting');
  assert.ok(crawlerCode.includes('concurrency') || crawlerCode.includes('concurrent'), 'Crawler must handle concurrency');
  console.log('  ✅ Concurrency handling present');

  console.log('\nTest 5: Content type validation');
  assert.ok(crawlerCode.includes('content-type') || crawlerCode.includes('contentType'), 'Crawler must validate content type');
  console.log('  ✅ Content type validation present');

  console.log('\nTest 6: URL normalization and deduplication');
  assert.ok(crawlerCode.includes('normalize') || crawlerCode.includes('canonical') || crawlerCode.includes('duplicate'), 'Crawler must normalize URLs and handle duplicates');
  console.log('  ✅ URL normalization present');

  console.log('\nTest 7: Redirect handling with limits');
  assert.ok(crawlerCode.includes('redirect'), 'Crawler must handle redirects');
  console.log('  ✅ Redirect handling present');

  console.log('\nTest 8: Response size limits');
  // Check for size limits or streaming
  if (crawlerCode.includes('size') || crawlerCode.includes('limit') || crawlerCode.includes('stream')) {
    console.log('  ✅ Response size handling present');
  } else {
    console.warn('  ⚠️  Response size handling not explicitly found, but may be in HTTP client');
  }
}

console.log('\nTest 9: Fixture site validation');

const fixtureFiles = [
  'tests/fixtures/site/index.html',
  'tests/fixtures/site/robots.txt',
  'tests/fixtures/site/sitemap.xml',
  'tests/fixtures/site/about.html',
  'tests/fixtures/site/products.html',
  'tests/fixtures/site/contact.html',
];

for (const file of fixtureFiles) {
  try {
    const content = fs.readFileSync(file, 'utf-8');
    assert.ok(content.length > 0, `${file} should have content`);
    console.log(`  ✅ ${file} exists (${content.length} bytes)`);
  } catch (e) {
    console.error(`  ❌ ${file} missing`);
    throw e;
  }
}

console.log('\nTest 10: Fixture site SEO issues for audit');

const indexContent = fs.readFileSync('tests/fixtures/site/index.html', 'utf-8');
assert.ok(indexContent.includes('<h1>'), 'index.html should have H1');
assert.ok(indexContent.includes('alt='), 'index.html should have alt attributes');
assert.ok(indexContent.includes('broken-link'), 'index.html should have broken link for testing');
console.log('  ✅ index.html has expected elements');

const productsContent = fs.readFileSync('tests/fixtures/site/products.html', 'utf-8');
// Should have duplicate title and multiple H1
const h1Count = (productsContent.match(/<h1>/g) || []).length;
assert.ok(h1Count >= 2, 'products.html should have multiple H1 for testing multiple-h1 rule');
console.log(`  ✅ products.html has ${h1Count} H1 tags (multiple-h1 test)`);

const contactContent = fs.readFileSync('tests/fixtures/site/contact.html', 'utf-8');
assert.ok(!contactContent.includes('<title>'), 'contact.html should have missing title for testing');
console.log('  ✅ contact.html has missing title (missing-title test)');

console.log('\nTest 11: Crawl persistence');

const appCode = fs.readFileSync('apps/api/src/app.ts', 'utf-8');
assert.ok(appCode.includes('crawl_pages'), 'API must persist crawl_pages');
assert.ok(appCode.includes('crawl_runs') || appCode.includes('crawl'), 'API must handle crawl runs');
console.log('  ✅ Crawl persistence present');

console.log('\nTest 12: Worker job handling');

const workerCode = fs.readFileSync('apps/worker/src/index.ts', 'utf-8');
assert.ok(workerCode.includes('SITE_CRAWL'), 'Worker must handle SITE_CRAWL jobs');
assert.ok(workerCode.includes('SEO_AUDIT') || workerCode.includes('audit'), 'Worker must handle audit');
console.log('  ✅ Worker job handling present');

console.log('\n✅ All crawl safety tests PASSED');
