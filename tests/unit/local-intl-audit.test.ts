/** Local SEO and hreflang checks on synthetic crawl pages. */
import assert from 'assert';
import { runLocalIntlAudit, normalizePhone, type AuditPage } from '../../apps/worker/src/local-intl-audit.js';

console.log('Testing local and international audit rules...');
const page = (url: string, extra: Partial<AuditPage> = {}): AuditPage => ({ url, statusCode: 200, isIndexable: true, hreflang: [], structuredData: [], htmlLang: 'fa-IR', phones: [], ...extra });
const ids = (pages: AuditPage[]) => runLocalIntlAudit(pages).map((f) => f.ruleId).sort();

// Phone numbers compare across formats and digit scripts.
assert.strictEqual(normalizePhone('+98 21 8888 1234'), normalizePhone('۰۲۱-۸۸۸۸۱۲۳۴'));
assert.strictEqual(normalizePhone('0098 912 345 6789'), normalizePhone('09123456789'));
assert.notStrictEqual(normalizePhone('021 8888 1234'), normalizePhone('021 8888 9999'));
console.log('✅ phone normalisation');

// A complete local business with a matching phone and correct hreflang has no findings.
const business = { '@context': 'https://schema.org', '@type': 'GeneralContractor', name: 'Gardima', telephone: '+98 21 8888 1234',
  address: { '@type': 'PostalAddress', streetAddress: 'Valiasr 1', addressLocality: 'Tehran' } };
const good = [
  page('https://site.test/', { structuredData: [{ '@graph': [business] }], phones: ['۰۲۱-۸۸۸۸۱۲۳۴'],
    hreflang: [{ lang: 'fa-IR', href: 'https://site.test/' }, { lang: 'en', href: 'https://site.test/en/' }, { lang: 'x-default', href: 'https://site.test/' }] }),
  page('https://site.test/en/', { htmlLang: 'en', hreflang: [{ lang: 'en', href: 'https://site.test/en/' }, { lang: 'fa-IR', href: 'https://www.site.test/' }] }),
];
assert.deepStrictEqual(ids(good), [], 'a correct site has no local or hreflang findings');
console.log('✅ correct site → no findings (schema inside @graph, www and trailing slash tolerated)');

// No schema and no phone.
assert.deepStrictEqual(ids([page('https://a.test/')]), ['missing_contact_phone', 'missing_local_business_schema']);
const notice = runLocalIntlAudit([page('https://a.test/')]).find((f) => f.ruleId === 'missing_local_business_schema')!;
assert.strictEqual(notice.severity, 'notice', 'a site that may not be local loses no score');
console.log('✅ missing LocalBusiness is a notice; missing tel: link is reported');

// Incomplete schema and a phone that differs from the site.
const partial = runLocalIntlAudit([page('https://a.test/', { phones: ['021 1111 2222'], structuredData: [{ '@type': ['LocalBusiness'], name: 'X', telephone: '021 8888 1234' }] })]);
assert.deepStrictEqual(partial.map((f) => f.ruleId).sort(), ['local_business_schema_incomplete', 'local_phone_mismatch']);
assert.deepStrictEqual(partial.find((f) => f.ruleId === 'local_business_schema_incomplete')!.evidence.missing, ['address']);
console.log('✅ incomplete schema and phone mismatch');

// hreflang problems.
const intl = [
  page('https://b.test/', { htmlLang: undefined, phones: ['1234567'], hreflang: [{ lang: 'english', href: '/en/' }, { lang: 'en', href: 'https://b.test/en/' }] }),
  page('https://b.test/en/', { htmlLang: 'en', phones: ['1234567'] }),
];
const intlIds = ids(intl).filter((id) => !id.startsWith('missing_local'));
assert.deepStrictEqual(intlIds, ['hreflang_invalid', 'hreflang_missing_return', 'hreflang_missing_self', 'missing_html_lang']);
console.log('✅ invalid code, relative URL, no self reference, no return link, missing html lang');

// Non-200 pages are ignored.
assert.deepStrictEqual(runLocalIntlAudit([page('https://c.test/', { statusCode: 404 })]), []);
console.log('\n✅ ALL local and international audit tests passed');
