// Customer-facing wording for values that the API and worker store as codes.
import type { AuditFinding } from './types';
import { toPersianDigits } from './persian';

export const SEVERITY_LABELS: Record<string, string> = {
  critical: 'بحرانی',
  high: 'زیاد',
  medium: 'متوسط',
  low: 'کم',
  notice: 'اطلاع',
};

export const FINDING_STATUS_LABELS: Record<string, string> = {
  open: 'باز',
  fixed: 'رفع‌شده',
  ignored: 'نادیده‌گرفته‌شده',
};

export const CATEGORY_LABELS: Record<string, string> = {
  crawlability: 'قابلیت خزش',
  indexability: 'قابلیت ایندکس',
  metadata: 'متادیتا',
  content: 'محتوا',
  links: 'لینک‌ها',
  images: 'تصاویر',
  performance: 'کارایی',
  security: 'امنیت',
  structured_data: 'داده ساختاریافته',
  'structured-data': 'داده ساختاریافته',
  international: 'سئوی بین‌المللی',
  local: 'سئوی محلی',
};

export const JOB_TYPE_LABELS: Record<string, string> = {
  SITE_CRAWL: 'خزش و ممیزی سایت',
  SEO_AUDIT: 'ممیزی سئو',
  RANK_CHECK: 'بررسی رتبه',
  BACKLINK_SYNC: 'همگام‌سازی بک‌لینک',
  GSC_SYNC: 'همگام‌سازی سرچ کنسول',
  GA4_SYNC: 'همگام‌سازی آنالیتیکس',
  PAGESPEED_CHECK: 'بررسی سرعت صفحه',
  COMPETITOR_CHECK: 'بررسی رقبا',
  ALERT_EVALUATION: 'بررسی هشدارها',
  CONTENT_BRIEF: 'تولید بریف محتوا',
  AI_VISIBILITY_CHECK: 'بررسی دیده‌شدن در هوش مصنوعی',
  REPORT_GENERATION: 'ساخت گزارش',
  WEBHOOK_DELIVERY: 'ارسال وب‌هوک',
  FIX_SUGGESTIONS: 'نوشتن پیشنهاد اصلاح سایت',
};

export const JOB_STATUS_LABELS: Record<string, string> = {
  pending: 'در صف',
  running: 'در حال اجرا',
  completed: 'تکمیل‌شده',
  failed: 'ناموفق',
  cancelled: 'لغوشده',
  dead_letter: 'ناموفق',
};

export const DEVICE_LABELS: Record<string, string> = {
  desktop: 'دسکتاپ',
  mobile: 'موبایل',
  both: 'دسکتاپ و موبایل',
};

export const COUNTRY_LABELS: Record<string, string> = {
  IR: 'ایران',
  US: 'آمریکا',
  GB: 'انگلستان',
  DE: 'آلمان',
  FR: 'فرانسه',
  TR: 'ترکیه',
  AE: 'امارات',
};

export const LANGUAGE_LABELS: Record<string, string> = {
  fa: 'فارسی',
  en: 'انگلیسی',
  ar: 'عربی',
  tr: 'ترکی',
};

const RULES: Record<string, { title: string; recommendation: string; siteWide?: string }> = {
  missing_title: { title: 'عنوان صفحه وجود ندارد', recommendation: 'برای هر صفحه یک عنوان یکتا بنویسید.' },
  duplicate_title: { title: 'عنوان تکراری', recommendation: 'برای هر صفحه عنوانی متفاوت و متناسب با محتوای همان صفحه بنویسید.' },
  title_too_long: { title: 'عنوان طولانی', recommendation: 'عنوان را کوتاه کنید تا در نتایج جست‌وجو بریده نشود.' },
  missing_meta_description: { title: 'توضیحات متا وجود ندارد', recommendation: 'برای هر صفحه توضیحات متای یکتا و خلاصه بنویسید.' },
  missing_h1: { title: 'تیتر H1 وجود ندارد', recommendation: 'برای هر صفحه یک تیتر H1 قرار دهید.' },
  thin_content: { title: 'محتوای کم', recommendation: 'محتوای صفحه را با اطلاعات کاربردی کامل‌تر کنید یا صفحه را از ایندکس خارج کنید.' },
  images_without_alt: { title: 'تصویر بدون متن جایگزین', recommendation: 'برای تصاویر، متن جایگزین (alt) توصیفی بنویسید.' },
  broken_links: { title: 'صفحهٔ خراب', recommendation: 'نشانی را اصلاح یا به صفحهٔ معتبر ریدایرکت کنید.' },
  noindex_pages: { title: 'صفحهٔ بدون ایندکس', recommendation: 'مطمئن شوید این صفحات عمداً از ایندکس خارج شده‌اند.' },
  missing_canonical: { title: 'تگ کنونیکال وجود ندارد', recommendation: 'برای هر صفحه تگ کنونیکال مشخص کنید.' },
  slow_pages: { title: 'صفحهٔ کند', recommendation: 'حجم تصاویر و اسکریپت‌ها و زمان پاسخ سرور را کاهش دهید.' },
  missing_structured_data: { title: 'دادهٔ ساختاریافته وجود ندارد', recommendation: 'دادهٔ ساختاریافتهٔ مناسب نوع صفحه را اضافه کنید.' },
  insecure_links: { title: 'لینک ناامن', recommendation: 'لینک‌های HTTP را به HTTPS تغییر دهید.' },
  missing_robots_txt: { title: 'فایل robots.txt وجود ندارد', recommendation: 'فایل robots.txt را در ریشهٔ سایت قرار دهید.' },
  missing_sitemap: { title: 'نقشهٔ سایت وجود ندارد', recommendation: 'نقشهٔ سایت بسازید و نشانی آن را در robots.txt بنویسید.' },
  missing_local_business_schema: {
    title: 'دادهٔ ساختاریافتهٔ کسب‌وکار محلی (LocalBusiness) وجود ندارد',
    recommendation: 'اگر کسب‌وکار در یک شهر یا محدودهٔ مشخص خدمت می‌دهد، Schema از نوع LocalBusiness (یا نوع دقیق‌تر مثل GeneralContractor) با نام، نشانی و تلفن اضافه کنید.',
    siteWide: 'در هیچ صفحه‌ای از سایت پیدا نشد. اگر سایت کسب‌وکار محلی نیست، این مورد را نادیده بگیرید.',
  },
  local_business_schema_incomplete: { title: 'اطلاعات LocalBusiness ناقص است', recommendation: 'نام، نشانی (خیابان و شهر) و تلفن را در Schema کامل کنید.' },
  local_phone_mismatch: {
    title: 'تلفن Schema با تلفن سایت یکی نیست',
    recommendation: 'یک شمارهٔ تلفن را همه‌جا یکسان بنویسید: در Schema، در سایت و در Google Business Profile.',
  },
  missing_contact_phone: {
    title: 'شمارهٔ تلفن قابل کلیک وجود ندارد',
    recommendation: 'تلفن کسب‌وکار را به‌صورت لینک tel: در صفحهٔ تماس و پایین صفحه‌ها قرار دهید.',
    siteWide: 'در هیچ صفحه‌ای لینک tel: پیدا نشد.',
  },
  missing_html_lang: { title: 'زبان صفحه مشخص نشده', recommendation: 'در تگ <html> ویژگی lang را بنویسید، مثلاً lang="fa-IR" یا lang="en-US".' },
  hreflang_invalid: { title: 'hreflang نامعتبر', recommendation: 'از کد زبان استاندارد (مثل en، en-GB، fa-IR یا x-default) و نشانی کامل با https استفاده کنید.' },
  hreflang_missing_self: { title: 'hreflang بدون ارجاع به خود صفحه', recommendation: 'در فهرست hreflang هر صفحه، خود آن صفحه را هم با زبان خودش بیاورید.' },
  hreflang_missing_return: {
    title: 'hreflang بدون لینک برگشت',
    recommendation: 'هر نسخهٔ زبانی باید به همهٔ نسخه‌های دیگر لینک دهد؛ گوگل لینکی را که برگشت ندارد نادیده می‌گیرد.',
  },
};

export function findingTitle(finding: Pick<AuditFinding, 'ruleId' | 'title'>): string {
  return RULES[finding.ruleId]?.title ?? finding.title;
}

export function findingRecommendation(finding: Pick<AuditFinding, 'ruleId' | 'recommendation'>): string {
  return RULES[finding.ruleId]?.recommendation ?? finding.recommendation;
}

export function findingDescription(finding: Pick<AuditFinding, 'ruleId' | 'description' | 'affectedUrls'>): string {
  const rule = RULES[finding.ruleId];
  if (!rule) return finding.description;
  if (rule.siteWide) return rule.siteWide;
  return `این مورد در ${toPersianDigits(finding.affectedUrls.length)} صفحه دیده شد.`;
}

/** System alerts are stored in English. Rules are matched by code, so old rows read correctly too. */
export function alertText(alert: { title?: string | null; message?: string | null; rule?: string | null; data?: unknown }): { title: string; message: string } {
  const data = (alert.data ?? {}) as { seoScore?: number };
  const lowScore = /^Low SEO score:?\s*(\d+)/i.exec(alert.title ?? '');
  if (alert.rule === 'low_seo_score' || lowScore) {
    const score = data.seoScore ?? (lowScore ? Number(lowScore[1]) : undefined);
    return {
      title: score === undefined ? 'امتیاز سئو پایین است' : `امتیاز سئو پایین است: ${toPersianDigits(score)}`,
      message: 'نتیجهٔ آخرین خزش این پروژه زیر ۵۰ است. یافته‌های ممیزی را بررسی کنید.',
    };
  }
  if (alert.rule === 'critical_issues') {
    return { title: 'مشکل بحرانی سئو پیدا شد', message: 'در این پروژه مشکل بحرانی باز وجود دارد. یافته‌های ممیزی را بررسی کنید.' };
  }
  if (alert.rule === 'job_dead_letter') {
    return { title: 'یک کار پس‌زمینه ناموفق شد', message: 'این کار پس از چند تلاش انجام نشد. دوباره آن را اجرا کنید یا با پشتیبانی تماس بگیرید.' };
  }
  return { title: alert.title || alert.message || '', message: alert.message || '' };
}

const API_MESSAGES: Record<string, string> = {
  'This address cannot be reached or is not allowed': 'این نشانی در دسترس نیست یا مجاز نیست. دامنه را بررسی کنید.',
  'Competitor already exists': 'این رقیب قبلاً اضافه شده است.',
  'Rank provider not configured': 'بررسی خودکار رتبه هنوز فعال نشده است. از سرچ کنسول یا فایل CSV استفاده کنید.',
  'Backlink provider not configured': 'همگام‌سازی خودکار بک‌لینک هنوز فعال نشده است. از فایل CSV استفاده کنید.',
  'Insufficient credits for crawl': 'اعتبار کافی برای خزش ندارید.',
  'Too many requests, please try again later': 'تعداد درخواست‌ها زیاد بوده است. چند دقیقه دیگر دوباره تلاش کنید.',
  'Rate limit exceeded. Please try again later.': 'تعداد درخواست‌ها زیاد بوده است. چند دقیقه دیگر دوباره تلاش کنید.',
  'Too many auth attempts, please try again later': 'تعداد تلاش‌ها زیاد بوده است. چند دقیقه دیگر دوباره تلاش کنید.',
  'A crawl is already running for this project': 'یک خزش برای این پروژه در حال اجراست. پس از پایان آن دوباره تلاش کنید.',
  'Project not found': 'پروژه پیدا نشد.',
  'Validation failed': 'اطلاعات واردشده معتبر نیست.',
};

export function apiMessage(message?: string | null, fallback = 'انجام نشد. دوباره تلاش کنید.'): string {
  if (!message) return fallback;
  if (API_MESSAGES[message]) return API_MESSAGES[message];
  if (message.startsWith('AI provider not configured')) return 'سرویس هوش مصنوعی هنوز فعال نشده است.';
  return /[؀-ۿ]/.test(message) ? message : fallback;
}

export function formatDateTime(value?: string | number | Date | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDateOnly(value?: string | number | Date | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fa-IR');
}

/** Plain reason for a failed background job. Raw provider errors are not shown to customers. */
export function jobFailureReason(error?: string | null): string {
  const text = (error ?? '').toLowerCase();
  if (!text) return 'علت ثبت نشده است.';
  if (/does not track google for country/.test(text)) return 'سرویس رتبه برای کشور این پروژه پشتیبانی نمی‌شود.';
  if (/sufficient permission/.test(text)) return 'این حساب گوگل به این سایت در سرچ کنسول دسترسی کافی ندارد. مالکیت سایت را در سرچ کنسول تأیید کنید.';
  if (/503|high demand|unavailable/.test(text)) return 'سرویس هوش مصنوعی الان شلوغ است. چند دقیقه دیگر دوباره تلاش کنید.';
  if (/404|no longer available|not found/.test(text)) return 'مدل انتخاب‌شده در این سرویس در دسترس نیست.';
  if (/location is not supported/.test(text)) return 'این سرویس از این منطقه در دسترس نیست.';
  if (/401|unauthori[sz]ed|invalid.*(key|api)|incorrect api key/.test(text)) return 'کلید سرویس نامعتبر است.';
  if (/quota|insufficient|billing|credit|run out of searches/.test(text)) return 'اعتبار یا سهمیهٔ سرویس تمام شده است.';
  if (/403|forbidden|country|region|territory|unsupported/.test(text)) return 'این سرویس از این منطقه یا با این حساب در دسترس نیست.';
  if (/429|rate/.test(text)) return 'سرویس موقتاً محدود شده است. بعداً دوباره تلاش کنید.';
  if (/timeout|timed out|abort|fetch failed|econn|enotfound|network/.test(text)) return 'اتصال به سرویس برقرار نشد.';
  return 'سرویس خطا داد. دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.';
}

export function hasAiProvider(status: Record<string, unknown>): boolean {
  return ['openai', 'anthropic', 'google', 'openrouter', 'perplexity'].some((key) => status[key] === 'connected');
}

/** Bands used by Ahrefs for its Health Score. */
export function scoreBand(score: number): { label: string; color: string } {
  if (score >= 91) return { label: 'عالی', color: 'text-accent-green' };
  if (score >= 71) return { label: 'خوب', color: 'text-accent-green' };
  if (score >= 31) return { label: 'متوسط', color: 'text-accent-yellow' };
  return { label: 'ضعیف', color: 'text-accent-red' };
}
