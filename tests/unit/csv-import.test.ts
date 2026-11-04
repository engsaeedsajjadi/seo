import assert from 'node:assert/strict';
import { parseCsv, parseNumber, toBacklinkRows, toRankRows } from '../../src/lib/csv-parse.js';

// Search Console export, English interface.
assert.deepEqual(toRankRows(parseCsv('\ufeffTop queries,Clicks,Impressions,CTR,Position\n"کلمه, با ویرگول",12,300,4%,3.4\nseo,1,10,10%,0\n')), [
  { query: 'کلمه, با ویرگول', position: 3.4, clicks: 12, impressions: 300, url: undefined },
]);
// Search Console export, Persian interface with Persian digits.
assert.equal(toRankRows(parseCsv('جستجوهای برتر,کلیک‌ها,نمایش‌ها,CTR,موقعیت\nخرید,۱۲,۱٬۳۰۰,۱٪,۷٫۵\n'))?.[0].position, 7.5);
assert.equal(toRankRows(parseCsv('جستجوهای برتر,کلیک‌ها,نمایش‌ها,CTR,موقعیت\nخرید,۱۲,۱٬۳۰۰,۱٪,۷٫۵\n'))?.[0].impressions, 1300);
// Semicolons and missing columns.
assert.equal(toRankRows(parseCsv('Keyword;Position\nabc;2\n'))?.length, 1);
assert.equal(toRankRows(parseCsv('foo,bar\n1,2\n')), null);
// Ahrefs-style and Search Console linking sites.
assert.deepEqual(toBacklinkRows(parseCsv('Referring page URL,Target URL,Anchor,Domain rating,Nofollow\nhttps://a.ir/x,https://me.ir/,لینک,40,true\n'))?.[0], { sourceUrl: 'https://a.ir/x', targetUrl: 'https://me.ir/', anchor: 'لینک', domainRating: 40, nofollow: true });
assert.equal(toBacklinkRows(parseCsv('Site,Linking pages,Target pages\nexample.ir,3,1\n'))?.[0].sourceUrl, 'https://example.ir');
assert.equal(parseNumber('abc'), undefined);
assert.strictEqual(toBacklinkRows([['Top linking sites'], ['not-a-url'], ['example.com']])?.length, 1, 'an address without a domain is skipped');
console.log('PASS: CSV import parses real export formats');
