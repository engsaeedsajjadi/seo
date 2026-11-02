/** Parses CSV text from any SEO tool export: BOM, quotes, and comma, semicolon or tab separators. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const separator = [',', ';', '\t'].reduce((best, s) => (firstLine.split(s).length > firstLine.split(best).length ? s : best), ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === separator) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}

/** Persian digits and thousands separators appear in exports from a Persian interface. */
export function parseNumber(value: string | undefined): number | undefined {
  if (value == null) return undefined;
  const latin = value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const n = Number(latin.replace(/[,٬%\s]/g, '').replace('٫', '.'));
  return value.trim() === '' || Number.isNaN(n) ? undefined : n;
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[‌_-]/g, ' ').replace(/\s+/g, ' ');

/** Finds a column by the header names real exports use. */
export function findColumn(header: string[], names: string[]): number {
  const cells = header.map(norm);
  const wanted = names.map(norm);
  return cells.findIndex((c) => wanted.includes(c));
}

const QUERY_NAMES = ['top queries', 'queries', 'query', 'keyword', 'keywords', 'جستجوهای برتر', 'جست وجوهای برتر', 'پرسش های برتر', 'عبارت', 'کلمه کلیدی'];
const POSITION_NAMES = ['position', 'average position', 'pos', 'rank', 'current position', 'موقعیت', 'جایگاه', 'رتبه'];
const SOURCE_NAMES = ['referring page url', 'source url', 'source page url', 'linking page', 'site', 'top linking sites', 'linking sites', 'سایت', 'سایت های پیونددهنده برتر', 'صفحه مبدا', 'مبدا'];
const TARGET_NAMES = ['target url', 'target page', 'top linked pages', 'صفحه مقصد', 'مقصد'];
const ANCHOR_NAMES = ['anchor', 'anchor text', 'متن لنگر', 'متن لینک'];
const RATING_NAMES = ['domain rating', 'dr', 'page ascore', 'authority score', 'domain authority', 'da', 'اعتبار دامنه'];
const NOFOLLOW_NAMES = ['nofollow', 'no follow'];

export interface RankRow { query: string; position: number; clicks?: number; impressions?: number; url?: string }
export interface BacklinkRow { sourceUrl: string; targetUrl?: string; anchor?: string; domainRating?: number; nofollow?: boolean }

export function toRankRows(rows: string[][]): RankRow[] | null {
  const [header, ...body] = rows;
  if (!header) return null;
  const q = findColumn(header, QUERY_NAMES);
  const p = findColumn(header, POSITION_NAMES);
  if (q < 0 || p < 0) return null;
  const clicks = findColumn(header, ['clicks', 'کلیک ها', 'کلیک']);
  const impressions = findColumn(header, ['impressions', 'نمایش ها', 'نمایش']);
  const url = findColumn(header, ['url', 'page', 'landing page', 'نشانی', 'صفحه']);
  return body.flatMap((r) => {
    const position = parseNumber(r[p]);
    const query = r[q]?.trim();
    if (!query || position == null || position <= 0) return [];
    return [{ query, position, clicks: parseNumber(r[clicks]), impressions: parseNumber(r[impressions]), url: url >= 0 ? r[url]?.trim() || undefined : undefined }];
  });
}

export function toBacklinkRows(rows: string[][]): BacklinkRow[] | null {
  const [header, ...body] = rows;
  if (!header) return null;
  const s = findColumn(header, SOURCE_NAMES);
  if (s < 0) return null;
  const t = findColumn(header, TARGET_NAMES);
  const a = findColumn(header, ANCHOR_NAMES);
  const d = findColumn(header, RATING_NAMES);
  const n = findColumn(header, NOFOLLOW_NAMES);
  return body.flatMap((r) => {
    const raw = r[s]?.trim();
    if (!raw) return [];
    return [{
      sourceUrl: /^https?:\/\//i.test(raw) ? raw : `https://${raw}`,
      targetUrl: t >= 0 ? r[t]?.trim() || undefined : undefined,
      anchor: a >= 0 ? r[a]?.trim() || undefined : undefined,
      domainRating: d >= 0 ? parseNumber(r[d]) : undefined,
      nofollow: n >= 0 ? /^(true|yes|1|بله)$/i.test(r[n]?.trim() || '') : undefined,
    }];
  });
}
