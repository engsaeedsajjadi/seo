/**
 * Persian Localization Utilities
 * - Persian calendar (Jalali/Shamsi) via Intl.DateTimeFormat
 * - Persian numbers conversion
 * - Toman/Rial currency formatting
 * - RTL helpers
 */

// Persian digits mapping
const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const ENGLISH_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Convert English digits to Persian digits
 */
export function toPersianDigits(input: string | number): string {
  const str = String(input);
  let result = str;
  for (let i = 0; i < 10; i++) {
    result = result.replace(new RegExp(ENGLISH_DIGITS[i], 'g'), PERSIAN_DIGITS[i]);
  }
  return result;
}

/**
 * Convert Persian digits to English digits
 */
export function toEnglishDigits(input: string): string {
  let result = input;
  for (let i = 0; i < 10; i++) {
    result = result.replace(new RegExp(PERSIAN_DIGITS[i], 'g'), ENGLISH_DIGITS[i]);
  }
  return result;
}

/**
 * Format number with Persian digits and separators
 * Uses Intl.NumberFormat with fa-IR locale
 */
export function formatPersianNumber(
  num: number,
  options?: {
    usePersianDigits?: boolean;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
): string {
  const { usePersianDigits = true, minimumFractionDigits, maximumFractionDigits } = options || {};

  const formatter = new Intl.NumberFormat('fa-IR', {
    minimumFractionDigits,
    maximumFractionDigits,
  });

  const formatted = formatter.format(num);

  if (usePersianDigits) {
    return formatted;
  }

  return toEnglishDigits(formatted);
}

/**
 * Format date in Persian calendar (Jalali)
 * Uses Intl.DateTimeFormat with fa-IR-u-ca-persian
 */
export function formatPersianDate(
  date: Date | string | number,
  options?: {
    format?: 'short' | 'medium' | 'long' | 'full';
    includeTime?: boolean;
    calendar?: 'persian' | 'gregorian';
  }
): string {
  const { format = 'medium', includeTime = false, calendar = 'persian' } = options || {};
  const dateObj = date instanceof Date ? date : new Date(date);

  if (isNaN(dateObj.getTime())) {
    return 'تاریخ نامعتبر';
  }

  const locale = calendar === 'persian' ? 'fa-IR-u-ca-persian' : 'fa-IR';

  const formatOptions: Intl.DateTimeFormatOptions = {};

  switch (format) {
    case 'short':
      formatOptions.year = 'numeric';
      formatOptions.month = 'numeric';
      formatOptions.day = 'numeric';
      break;
    case 'medium':
      formatOptions.year = 'numeric';
      formatOptions.month = 'long';
      formatOptions.day = 'numeric';
      break;
    case 'long':
      formatOptions.weekday = 'long';
      formatOptions.year = 'numeric';
      formatOptions.month = 'long';
      formatOptions.day = 'numeric';
      break;
    case 'full':
      formatOptions.weekday = 'long';
      formatOptions.year = 'numeric';
      formatOptions.month = 'long';
      formatOptions.day = 'numeric';
      formatOptions.hour = '2-digit';
      formatOptions.minute = '2-digit';
      formatOptions.second = '2-digit';
      break;
  }

  if (includeTime && format !== 'full') {
    formatOptions.hour = '2-digit';
    formatOptions.minute = '2-digit';
  }

  try {
    const formatter = new Intl.DateTimeFormat(locale, formatOptions);
    return formatter.format(dateObj);
  } catch {
    // Fallback to gregorian if persian calendar not supported
    try {
      const fallbackFormatter = new Intl.DateTimeFormat('fa-IR', formatOptions);
      return fallbackFormatter.format(dateObj);
    } catch {
      return dateObj.toLocaleDateString('fa-IR');
    }
  }
}

/**
 * Format date and time in Persian
 */
export function formatPersianDateTime(
  date: Date | string | number,
  options?: {
    calendar?: 'persian' | 'gregorian';
  }
): string {
  return formatPersianDate(date, {
    format: 'medium',
    includeTime: true,
    calendar: options?.calendar,
  });
}

/**
 * Format relative time in Persian (e.g., "۵ دقیقه پیش")
 */
export function formatRelativePersianTime(date: Date | string | number): string {
  const dateObj = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 60) {
    return 'همین الان';
  }
  if (diffMinutes < 60) {
    if (diffMinutes === 1) return '۱ دقیقه پیش';
    return `${toPersianDigits(diffMinutes)} دقیقه پیش`;
  }
  if (diffHours < 24) {
    if (diffHours === 1) return '۱ ساعت پیش';
    return `${toPersianDigits(diffHours)} ساعت پیش`;
  }
  if (diffDays < 7) {
    if (diffDays === 1) return '۱ روز پیش';
    return `${toPersianDigits(diffDays)} روز پیش`;
  }
  if (diffWeeks < 4) {
    if (diffWeeks === 1) return '۱ هفته پیش';
    return `${toPersianDigits(diffWeeks)} هفته پیش`;
  }
  if (diffMonths < 12) {
    if (diffMonths === 1) return '۱ ماه پیش';
    return `${toPersianDigits(diffMonths)} ماه پیش`;
  }
  if (diffYears === 1) return '۱ سال پیش';
  return `${toPersianDigits(diffYears)} سال پیش`;
}

/**
 * Format currency in Toman/Rial
 */
export function formatCurrency(
  amount: number,
  options?: {
    currency?: 'toman' | 'rial' | 'usd' | 'eur';
    usePersianDigits?: boolean;
    compact?: boolean;
  }
): string {
  const { currency = 'toman', usePersianDigits = true, compact = false } = options || {};

  let formattedAmount: string;
  let currencyLabel: string;

  switch (currency) {
    case 'toman':
      currencyLabel = 'تومان';
      break;
    case 'rial':
      currencyLabel = 'ریال';
      break;
    case 'usd':
      currencyLabel = 'دلار';
      break;
    case 'eur':
      currencyLabel = 'یورو';
      break;
    default:
      currencyLabel = 'تومان';
  }

  if (compact && amount >= 1000) {
    if (amount >= 1000000000) {
      const billions = amount / 1000000000;
      formattedAmount = formatPersianNumber(billions, { maximumFractionDigits: 1, usePersianDigits });
      return `${formattedAmount} میلیارد ${currencyLabel}`;
    }
    if (amount >= 1000000) {
      const millions = amount / 1000000;
      formattedAmount = formatPersianNumber(millions, { maximumFractionDigits: 1, usePersianDigits });
      return `${formattedAmount} میلیون ${currencyLabel}`;
    }
    if (amount >= 1000) {
      const thousands = amount / 1000;
      formattedAmount = formatPersianNumber(thousands, { maximumFractionDigits: 0, usePersianDigits });
      return `${formattedAmount} هزار ${currencyLabel}`;
    }
  }

  formattedAmount = formatPersianNumber(amount, { usePersianDigits });

  if (currency === 'usd') {
    return usePersianDigits ? `${formattedAmount} ${currencyLabel}` : `$${toEnglishDigits(String(amount))}`;
  }
  if (currency === 'eur') {
    return usePersianDigits ? `${formattedAmount} ${currencyLabel}` : `€${toEnglishDigits(String(amount))}`;
  }

  return `${formattedAmount} ${currencyLabel}`;
}

/**
 * Format money specifically for Toman (default in Iran)
 * Converts Rial to Toman if needed (1 Toman = 10 Rial)
 */
export function formatMoney(
  amount: number,
  options?: {
    fromRial?: boolean;
    currency?: 'toman' | 'rial';
    usePersianDigits?: boolean;
    compact?: boolean;
  }
): string {
  const { fromRial = false, currency = 'toman', usePersianDigits = true, compact = false } = options || {};

  let finalAmount = amount;
  if (fromRial && currency === 'toman') {
    finalAmount = amount / 10;
  }

  return formatCurrency(finalAmount, { currency, usePersianDigits, compact });
}

/**
 * Format percentage in Persian
 */
export function formatPersianPercent(value: number, fractionDigits = 1): string {
  const formatted = formatPersianNumber(value, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    usePersianDigits: true,
  });
  return `${formatted}٪`;
}

/**
 * Format file size in Persian
 */
export function formatPersianFileSize(bytes: number): string {
  if (bytes === 0) return '۰ بایت';

  const k = 1024;
  const sizes = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت', 'ترابایت'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);

  return `${formatPersianNumber(Math.round(size * 100) / 100)} ${sizes[i]}`;
}

/**
 * Translate error codes to Persian messages
 */
export function translateError(errorCode: string): string {
  const errorMap: Record<string, string> = {
    // Generic
    UNKNOWN_ERROR: 'خطای ناشناخته رخ داد',
    SERVER_ERROR: 'خطای سرور',
    NETWORK_ERROR: 'خطای شبکه، اتصال خود را بررسی کنید',
    TIMEOUT: 'مهلت زمانی به پایان رسید',
    NOT_FOUND: 'موردی یافت نشد',
    FORBIDDEN: 'دسترسی مجاز نیست',
    UNAUTHORIZED: 'احراز هویت نشده',
    BAD_REQUEST: 'درخواست نامعتبر',
    TOO_MANY_REQUESTS: 'درخواست‌های بیش از حد مجاز',
    SERVICE_UNAVAILABLE: 'سرویس در دسترس نیست',

    // Auth
    INVALID_CREDENTIALS: 'ایمیل یا رمز عبور نادرست است',
    SESSION_EXPIRED: 'نشست شما منقضی شده است',
    TOKEN_INVALID: 'توکن نامعتبر است',
    TOKEN_EXPIRED: 'توکن منقضی شده است',
    ACCOUNT_LOCKED: 'حساب شما قفل شده است',
    EMAIL_NOT_VERIFIED: 'ایمیل شما تأیید نشده است',
    EMAIL_ALREADY_EXISTS: 'این ایمیل قبلاً ثبت شده است',
    WEAK_PASSWORD: 'رمز عبور ضعیف است',

    // Provider
    PROVIDER_NOT_CONFIGURED: 'سرویس‌دهنده پیکربندی نشده است',
    PROVIDER_ERROR: 'خطا در سرویس‌دهنده',
    PROVIDER_RATE_LIMITED: 'محدودیت نرخ سرویس‌دهنده',
    PROVIDER_QUOTA_EXCEEDED: 'سهمیه سرویس‌دهنده به پایان رسیده است',

    // Billing
    PAYMENT_FAILED: 'پرداخت ناموفق بود',
    INSUFFICIENT_CREDITS: 'اعتبار کافی ندارید',
    UPGRADE_REQUIRED: 'برای این ویژگی باید پلن خود را ارتقا دهید',

    // Validation
    VALIDATION_ERROR: 'خطای اعتبارسنجی',
    REQUIRED_FIELD: 'این فیلد الزامی است',
    INVALID_EMAIL: 'ایمیل نامعتبر است',
    INVALID_URL: 'آدرس نامعتبر است',
  };

  return errorMap[errorCode] || errorMap[errorCode.toUpperCase()] || 'خطایی رخ داد';
}

/**
 * Translate enum values to Persian
 */
export function translateEnum(enumType: string, value: string): string {
  const enumMaps: Record<string, Record<string, string>> = {
    status: {
      pending: 'در انتظار',
      running: 'در حال اجرا',
      completed: 'تکمیل شده',
      failed: 'ناموفق',
      cancelled: 'لغو شده',
      queued: 'در صف',
      paused: 'متوقف شده',
      draft: 'پیش‌نویس',
      active: 'فعال',
      inactive: 'غیرفعال',
    },
    severity: {
      critical: 'بحرانی',
      high: 'زیاد',
      medium: 'متوسط',
      low: 'کم',
      info: 'اطلاعاتی',
    },
    priority: {
      high: 'زیاد',
      medium: 'متوسط',
      low: 'کم',
      urgent: 'فوری',
    },
    role: {
      owner: 'مالک',
      admin: 'مدیر',
      member: 'عضو',
      viewer: 'مشاهده‌گر',
      client: 'مشتری',
    },
    plan: {
      free: 'رایگان',
      starter: 'شروع',
      pro: 'حرفه‌ای',
      agency: 'آژانس',
      enterprise: 'سازمانی',
    },
  };

  return enumMaps[enumType]?.[value.toLowerCase()] || value;
}

/**
 * RTL helper - returns logical CSS properties
 */
export function rtlClass(ltrClass: string, rtlClass: string, isRTL = true): string {
  return isRTL ? rtlClass : ltrClass;
}

/**
 * Check if current locale is RTL
 */
export function isRTL(locale = 'fa-IR'): boolean {
  return locale.startsWith('fa') || locale.startsWith('ar') || locale.startsWith('he');
}

/**
 * Get direction for locale
 */
export function getDirection(locale = 'fa-IR'): 'rtl' | 'ltr' {
  return isRTL(locale) ? 'rtl' : 'ltr';
}

/**
 * Format list in Persian (with "و")
 */
export function formatPersianList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} و ${items[1]}`;
  
  const last = items[items.length - 1];
  const rest = items.slice(0, -1);
  return `${rest.join('، ')} و ${last}`;
}

/**
 * Truncate text with Persian ellipsis
 */
export function truncatePersian(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

/**
 * Format duration in Persian
 */
export function formatPersianDuration(seconds: number): string {
  if (seconds < 60) {
    return `${toPersianDigits(Math.floor(seconds))} ثانیه`;
  }
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    if (remainingSeconds === 0) {
      return `${toPersianDigits(minutes)} دقیقه`;
    }
    return `${toPersianDigits(minutes)} دقیقه و ${toPersianDigits(remainingSeconds)} ثانیه`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (minutes === 0) {
    return `${toPersianDigits(hours)} ساعت`;
  }
  return `${toPersianDigits(hours)} ساعت و ${toPersianDigits(minutes)} دقیقه`;
}
