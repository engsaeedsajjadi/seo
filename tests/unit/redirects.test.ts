/** Redirect proposals for broken internal addresses. */
import assert from 'assert';
import { proposeRedirects } from '../../apps/worker/src/redirects.js';

console.log('Testing redirect proposals...');
const working = [
  'https://site.test/', 'https://site.test/tours/', 'https://site.test/tours/kish-island/', 'https://site.test/blog/',
  'https://www.site.test/%D8%AA%D9%88%D8%B1-%DA%A9%DB%8C%D8%B4/', 'https://other.test/tours/kish/',
];
const out = proposeRedirects([
  'https://site.test/tours/kish-old/',              // shares "tours" and "kish"
  'https://site.test/%D8%AA%D9%88%D8%B1-%DA%A9%DB%8C%D8%B4-%D9%82%D8%AF%DB%8C%D9%85/', // Persian words
  'https://site.test/zzz.html',                      // nothing close → home
  'https://other.test/tours/',                       // another site → ignored
], working, 'site.test');
assert.deepStrictEqual(out.map((r) => [r.from.split('site.test')[1], r.to.split('site.test')[1]]), [
  ['/tours/kish-old/', '/tours/kish-island/'],
  ['/%D8%AA%D9%88%D8%B1-%DA%A9%DB%8C%D8%B4-%D9%82%D8%AF%DB%8C%D9%85/', '/%D8%AA%D9%88%D8%B1-%DA%A9%DB%8C%D8%B4/'],
  ['/zzz.html', '/'],
]);
assert.strictEqual(out[2].score, 0, 'home page fallback has score 0');
assert.ok(out.every((r) => !r.to.includes('other.test')), 'never redirects to another site');
assert.strictEqual(proposeRedirects(['https://site.test/'], ['https://site.test/'], 'site.test').length, 0, 'no redirect to itself');
assert.strictEqual(proposeRedirects(Array.from({ length: 80 }, (_, i) => `https://site.test/x${i}`), working, 'site.test').length, 50, 'capped');
console.log('✅ ALL redirect proposal tests passed');
