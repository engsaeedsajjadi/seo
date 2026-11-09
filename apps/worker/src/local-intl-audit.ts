// Local SEO and international SEO checks, run on the pages of one crawl.
//
// Local: a business that serves customers in a place needs a LocalBusiness schema with its name,
// address and phone (NAP), and the same phone everywhere it appears.
// International: every hreflang tag must be valid and confirmed by the page it points to, and
// each page should declare its language.

export interface AuditPage {
  url: string;
  statusCode: number;
  isIndexable: boolean;
  hreflang: Array<{ lang: string; href: string }>;
  structuredData: any[];
  htmlLang?: string;
  phones?: string[];
}

export interface LocalIntlFinding {
  ruleId: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'notice';
  category: 'local' | 'international';
  title: string;
  description: string;
  evidence: Record<string, any>;
  affectedUrls: string[];
  recommendation: string;
}

// schema.org types that describe a business with a place (LocalBusiness and its common subtypes).
const LOCAL_TYPES = new Set([
  'localbusiness', 'homeandconstructionbusiness', 'generalcontractor', 'homeimprovementstore', 'housepainter',
  'electrician', 'plumber', 'roofingcontractor', 'locksmith', 'movingcompany', 'hvacbusiness',
  'professionalservice', 'legalservice', 'attorney', 'notary', 'accountingservice', 'financialservice',
  'realestateagent', 'travelagency', 'store', 'furniturestore', 'hardwarestore', 'homegoodsstore',
  'foodestablishment', 'restaurant', 'cafeorcoffeeshop', 'bakery', 'lodgingbusiness', 'hotel',
  'medicalbusiness', 'dentist', 'physician', 'medicalclinic', 'healthandbeautybusiness', 'beautysalon',
  'automotivebusiness', 'autorepair', 'autodealer', 'educationalorganization', 'sportsactivitylocation',
  'entertainmentbusiness', 'emergencyservice', 'governmentoffice', 'library', 'drycleaningorlaundry',
]);

/** Every object in the JSON-LD blocks of a page, including @graph members and nested items. */
function schemaNodes(data: any[]): any[] {
  const out: any[] = [];
  const visit = (node: any, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 6) return;
    if (Array.isArray(node)) { node.forEach((n) => visit(n, depth + 1)); return; }
    out.push(node);
    if (node['@graph']) visit(node['@graph'], depth + 1);
  };
  visit(data, 0);
  return out;
}

function types(node: any): string[] {
  const t = node?.['@type'];
  return (Array.isArray(t) ? t : [t]).filter((x) => typeof x === 'string').map((x: string) => x.replace(/^.*[/#]/, '').toLowerCase());
}

function isLocalBusiness(node: any): boolean {
  return types(node).some((t) => LOCAL_TYPES.has(t));
}

/** Digits only, with Persian and Arabic digits converted and the Iranian or other country prefix dropped. */
export function normalizePhone(value: string): string {
  const digits = String(value || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\D/g, '');
  // +98 21 1234 5678, 0098..., 021...: compare the national number without the leading 0.
  return digits.replace(/^00/, '').replace(/^98(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '');
}

function addressComplete(address: any): boolean {
  if (!address) return false;
  if (typeof address === 'string') return address.trim().length > 5;
  const a = Array.isArray(address) ? address[0] : address;
  return Boolean(a && (a.streetAddress || a.addressLocality));
}

// BCP 47 as used by hreflang: language, optional script, optional region; or x-default.
const HREFLANG = /^(x-default|[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|\d{3}))?)$/i;

function sameUrl(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    const path = (u: URL) => u.pathname.replace(/\/+$/, '') || '/';
    return x.host.replace(/^www\./, '') === y.host.replace(/^www\./, '') && path(x) === path(y) && x.search === y.search;
  } catch {
    return false;
  }
}

export function runLocalIntlAudit(allPages: AuditPage[]): LocalIntlFinding[] {
  const findings: LocalIntlFinding[] = [];
  const pages = allPages.filter((p) => p.statusCode >= 200 && p.statusCode < 300);
  if (pages.length === 0) return findings;

  // ---------------------------------------------------------------- local
  const businesses = pages.flatMap((p) => schemaNodes(p.structuredData).filter(isLocalBusiness).map((node) => ({ page: p, node })));
  const sitePhones = new Map<string, string[]>();
  for (const p of pages) {
    for (const raw of p.phones ?? []) {
      const n = normalizePhone(raw);
      if (n.length >= 7) sitePhones.set(n, [...(sitePhones.get(n) ?? []), p.url]);
    }
  }

  if (businesses.length === 0) {
    findings.push({
      ruleId: 'missing_local_business_schema',
      severity: 'notice',
      category: 'local',
      title: 'No LocalBusiness schema',
      description: 'No page has LocalBusiness structured data',
      evidence: { pagesChecked: pages.length },
      affectedUrls: [pages[0].url],
      recommendation: 'If the business serves customers in a place, add LocalBusiness JSON-LD with name, address and phone',
    });
  } else {
    const incomplete = businesses.filter(({ node }) => !node.name || !addressComplete(node.address) || !node.telephone);
    if (incomplete.length > 0) {
      findings.push({
        ruleId: 'local_business_schema_incomplete',
        severity: 'medium',
        category: 'local',
        title: 'LocalBusiness schema is incomplete',
        description: `${incomplete.length} LocalBusiness block(s) miss name, address or telephone`,
        evidence: {
          missing: [...new Set(incomplete.flatMap(({ node }) => [
            ...(node.name ? [] : ['name']), ...(addressComplete(node.address) ? [] : ['address']), ...(node.telephone ? [] : ['telephone']),
          ]))],
        },
        affectedUrls: [...new Set(incomplete.map(({ page }) => page.url))],
        recommendation: 'Fill name, address (street and city) and telephone in the LocalBusiness schema',
      });
    }
    // The phone in the schema should be one that the site shows to visitors.
    const schemaPhones = [...new Set(businesses.map(({ node }) => normalizePhone(String(node.telephone ?? ''))).filter((n) => n.length >= 7))];
    const mismatched = sitePhones.size > 0 ? schemaPhones.filter((n) => !sitePhones.has(n)) : [];
    if (mismatched.length > 0) {
      findings.push({
        ruleId: 'local_phone_mismatch',
        severity: 'medium',
        category: 'local',
        title: 'Phone in schema differs from the site',
        description: 'The LocalBusiness telephone does not match any phone link on the site',
        evidence: { schemaPhones: mismatched.length, sitePhones: sitePhones.size },
        affectedUrls: [...new Set(businesses.map(({ page }) => page.url))],
        recommendation: 'Use the same phone number in the schema, on the site and in Google Business Profile',
      });
    }
  }
  if (sitePhones.size === 0 && !businesses.some(({ node }) => node.telephone)) {
    findings.push({
      ruleId: 'missing_contact_phone',
      severity: 'low',
      category: 'local',
      title: 'No clickable phone number',
      description: 'No page has a tel: link',
      evidence: { pagesChecked: pages.length },
      affectedUrls: [pages[0].url],
      recommendation: 'Add the business phone as a tel: link, at least on the contact page and in the footer',
    });
  }

  // ---------------------------------------------------------------- international
  const indexable = pages.filter((p) => p.isIndexable);
  const noLang = indexable.filter((p) => !p.htmlLang || !HREFLANG.test(p.htmlLang.trim()));
  if (noLang.length > 0) {
    findings.push({
      ruleId: 'missing_html_lang',
      severity: 'low',
      category: 'international',
      title: 'Missing or invalid html lang',
      description: `${noLang.length} page(s) do not declare a valid language`,
      evidence: { examples: noLang.slice(0, 5).map((p) => ({ url: p.url, lang: p.htmlLang ?? null })) },
      affectedUrls: noLang.map((p) => p.url),
      recommendation: 'Set the lang attribute on <html>, for example lang="fa-IR" or lang="en-US"',
    });
  }

  const withHreflang = indexable.filter((p) => p.hreflang.length > 0);
  if (withHreflang.length > 0) {
    const invalid = withHreflang.filter((p) => p.hreflang.some((h) => !HREFLANG.test(h.lang.trim()) || !/^https?:\/\//i.test(h.href)));
    if (invalid.length > 0) {
      findings.push({
        ruleId: 'hreflang_invalid',
        severity: 'medium',
        category: 'international',
        title: 'Invalid hreflang',
        description: `${invalid.length} page(s) have a hreflang with a wrong language code or a relative URL`,
        evidence: { examples: invalid.slice(0, 5).map((p) => ({ url: p.url, values: p.hreflang.filter((h) => !HREFLANG.test(h.lang.trim()) || !/^https?:\/\//i.test(h.href)).slice(0, 3) })) },
        affectedUrls: invalid.map((p) => p.url),
        recommendation: 'Use ISO language codes (en, en-GB, fa-IR, x-default) and absolute URLs',
      });
    }
    const noSelf = withHreflang.filter((p) => !p.hreflang.some((h) => sameUrl(h.href, p.url)));
    if (noSelf.length > 0) {
      findings.push({
        ruleId: 'hreflang_missing_self',
        severity: 'low',
        category: 'international',
        title: 'hreflang without self reference',
        description: `${noSelf.length} page(s) list other languages but not themselves`,
        evidence: { count: noSelf.length },
        affectedUrls: noSelf.map((p) => p.url),
        recommendation: 'Include a hreflang for the page itself in its own language',
      });
    }
    // A link to a crawled page that does not link back is ignored by Google.
    const missingReturn: { url: string; target: string }[] = [];
    for (const p of withHreflang) {
      for (const h of p.hreflang) {
        if (sameUrl(h.href, p.url)) continue;
        const target = pages.find((q) => sameUrl(q.url, h.href));
        if (target && !target.hreflang.some((back) => sameUrl(back.href, p.url))) missingReturn.push({ url: p.url, target: target.url });
      }
    }
    if (missingReturn.length > 0) {
      findings.push({
        ruleId: 'hreflang_missing_return',
        severity: 'medium',
        category: 'international',
        title: 'hreflang without return link',
        description: `${missingReturn.length} hreflang link(s) are not confirmed by the target page`,
        evidence: { examples: missingReturn.slice(0, 5) },
        affectedUrls: [...new Set(missingReturn.map((m) => m.url))],
        recommendation: 'Every language version must list all the others, including the page that points to it',
      });
    }
  }
  return findings;
}
