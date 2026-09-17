# مستندات فارسی‌سازی رنک‌فورج

## نمای کلی

رنک‌فورج به صورت پیش‌فرض با زبان فارسی (fa-IR) و چیدمان راست‌به‌چپ (RTL) ارائه می‌شود. این مستندات معماری فارسی‌سازی، ابزارها و راهنمای توسعه را پوشش می‌دهد.

## معماری i18n

### ساختار فایل‌ها

```
src/i18n/
├── index.ts                 # هسته i18n، تابع t()، هوک useTranslation
└── fa/                      # ترجمه‌های فارسی
    ├── index.ts             # تجمیع همه ماژول‌ها
    ├── common.ts            # مشترک (ناوبری، عملیات، وضعیت‌ها)
    ├── auth.ts              # احراز هویت
    ├── dashboard.ts         # داشبورد
    ├── projects.ts          # پروژه‌ها
    ├── crawl.ts             # خزش
    ├── audit.ts             # ممیزی
    ├── keywords.ts          # کلمات کلیدی
    ├── rankings.ts          # رتبه‌بندی
    ├── competitors.ts       # رقبا
    ├── backlinks.ts         # بک‌لینک‌ها
    ├── integrations.ts      # یکپارچه‌سازی‌ها
    ├── reports.ts           # گزارش‌ها
    ├── billing.ts           # صورتحساب
    ├── settings.ts          # تنظیمات
    ├── notifications.ts     # اعلان‌ها
    ├── errors.ts            # خطاها
    ├── validation.ts        # اعتبارسنجی
    ├── calendar.ts          # تقویم
    ├── payment.ts           # پرداخت
    └── help.ts              # راهنما
```

### استفاده از ترجمه

```typescript
import { t } from '@/i18n';
import { useTranslation } from '@/hooks/useTranslation';

// روش ۱: تابع مستقیم
t('common.dashboard') // => "داشبورد"
t('common.minutesAgo', { count: 5 }) // => "۵ دقیقه پیش"

// روش ۲: هوک
function MyComponent() {
  const { t, isRTL, direction } = useTranslation();
  return <div dir={direction}>{t('common.loading')}</div>;
}
```

## تقویم فارسی

### استفاده از Intl.DateTimeFormat

سیستم از `Intl.DateTimeFormat` با تقویم فارسی استفاده می‌کند:

```typescript
import { formatPersianDate, formatPersianDateTime, formatRelativePersianTime } from '@/lib/persian';

// تقویم شمسی
formatPersianDate(new Date(), { format: 'medium', calendar: 'persian' })
// => "۲۶ اردیبهشت ۱۴۰۳"

formatPersianDate(new Date(), { format: 'long' })
// => "شنبه، ۲۶ اردیبهشت ۱۴۰۳"

formatRelativePersianTime(new Date(Date.now() - 5 * 60 * 1000))
// => "۵ دقیقه پیش"
```

### انواع فرمت

- `short`: `۱۴۰۳/۰۲/۲۶`
- `medium`: `۲۶ اردیبهشت ۱۴۰۳`
- `long`: `شنبه، ۲۶ اردیبهشت ۱۴۰۳`
- `full`: `شنبه، ۲۶ اردیبهشت ۱۴۰۳، ساعت ۱۴:۳۰:۰۰`

### ماه‌های فارسی

- فروردین، اردیبهشت، خرداد، تیر، مرداد، شهریور
- مهر، آبان، آذر، دی، بهمن، اسفند

## اعداد فارسی

### تبدیل اعداد

```typescript
import { toPersianDigits, toEnglishDigits, formatPersianNumber } from '@/lib/persian';

toPersianDigits(123) // => "۱۲۳"
toEnglishDigits("۱۲۳") // => "123"
formatPersianNumber(1234567) // => "۱٬۲۳۴٬۵۶۷"
```

### اعداد در UI

همه اعداد در رابط کاربری به صورت فارسی نمایش داده می‌شوند:

```tsx
<span className="persian-numbers">{toPersianDigits(count)}</span>
```

کلاس `persian-numbers` برای نمایش صحیح اعداد فارسی با `font-feature-settings: 'ss01'` استفاده می‌شود.

## واحد پول - تومان/ریال

### فرمت‌بندی

```typescript
import { formatCurrency, formatMoney } from '@/lib/persian';

formatCurrency(50000, { currency: 'toman' })
// => "۵۰٬۰۰۰ تومان"

formatCurrency(50000, { currency: 'rial' })
// => "۵۰٬۰۰۰ ریال"

formatMoney(500000, { fromRial: true, currency: 'toman' })
// ریال به تومان تبدیل: 500000 ریال = 50000 تومان
// => "۵۰٬۰۰۰ تومان"

formatCurrency(1500000, { currency: 'toman', compact: true })
// => "۱٫۵ میلیون تومان"
```

### نکات

- واحد پیش‌فرض در ایران: تومان
- ۱ تومان = ۱۰ ریال
- برای مقادیر بزرگ از `compact: true` استفاده کنید

## چیدمان RTL

### تنظیمات HTML

```html
<html lang="fa" dir="rtl">
```

### CSS Logical Properties

به جای `margin-left` از `margin-inline-start` استفاده کنید:

```css
/* ❌ غلط - فقط LTR */
margin-left: 16px;

/* ✅ درست - RTL و LTR */
margin-inline-start: 16px;
```

### کلاس‌های کمکی

```css
/* در src/index.css */
[dir="rtl"] .text-left { text-align: right; }
[dir="rtl"] .border-l { border-left: none; border-right-width: 1px; }
```

### هوک useRTL

```typescript
import { useRTL } from '@/hooks/useTranslation';

function MyComponent() {
  const { isRTL, direction, start, end } = useRTL();
  // start = 'right' در RTL، 'left' در LTR
  // end = 'left' در RTL، 'right' در LTR
}
```

## فونت Vazirmatn

### بارگذاری

```html
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@100;200;300;400;500;600;700;800;900&display=swap" rel="stylesheet">
```

### استفاده

```css
body {
  font-family: 'Vazirmatn', system-ui, sans-serif;
  font-feature-settings: 'ss01' 1;
}
```

### وزن‌ها

- `font-vazirmatn-thin`: 100
- `font-vazirmatn-light`: 300
- `font-vazirmatn-regular`: 400
- `font-vazirmatn-medium`: 500
- `font-vazirmatn-bold`: 700
- `font-vazirmatn-black`: 900

## PDF با پشتیبانی RTL

### تنظیمات PDF

```typescript
// برای PDFهای فارسی
const pdfOptions = {
  direction: 'rtl',
  font: 'Vazirmatn',
  lang: 'fa',
};

// استایل PDF RTL
.pdf-rtl {
  direction: rtl;
  text-align: right;
  font-family: 'Vazirmatn', sans-serif;
}
```

## کاتالوگ خطاها

همه خطاها به فارسی ترجمه شده‌اند:

```typescript
import { translateError } from '@/lib/persian';

translateError('PROVIDER_NOT_CONFIGURED')
// => "سرویس‌دهنده پیکربندی نشده است"

translateError('INVALID_CREDENTIALS')
// => "ایمیل یا رمز عبور نادرست است"
```

لیست کامل در `src/i18n/fa/errors.ts`

## اعتبارسنجی فارسی

پیام‌های اعتبارسنجی به فارسی:

```typescript
// src/i18n/fa/validation.ts
required: 'این فیلد الزامی است'
emailInvalid: 'ایمیل نامعتبر است'
passwordTooShort: 'رمز عبور باید حداقل {min} کاراکتر باشد'
```

## حالت‌های خالی و بارگذاری

### Empty States

```tsx
<div className="text-center py-8">
  <Icon className="w-12 h-12 text-slate-500 mx-auto mb-3" />
  <p className="text-sm text-slate-400 font-vazirmatn-regular">داده‌ای یافت نشد</p>
  <p className="text-xs text-slate-500 mt-1 font-vazirmatn-light">توضیح تکمیلی</p>
</div>
```

### Loading States

```tsx
<div className="flex items-center justify-center h-96" dir="rtl">
  <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
  <p className="text-sm text-slate-400 font-vazirmatn-regular">در حال بارگذاری...</p>
</div>
```

## دسترسی‌پذیری (a11y)

### برچسب‌های فارسی

```tsx
<button aria-label="باز کردن منو">
  <Menu />
</button>

<input aria-label="جستجوی پروژه‌ها" placeholder="جستجو..." />

<nav aria-label="منوی اصلی">
```

### متن‌های صفحه‌خوان

همه `aria-label`ها به فارسی نوشته شده‌اند.

## ایمیل و اعلان فارسی

### قالب ایمیل

```html
<div dir="rtl" lang="fa" style="font-family: Vazirmatn, Tahoma, sans-serif;">
  <h1>خوش آمدید به رنک‌فورج</h1>
  <p>حساب کاربری شما با موفقیت ایجاد شد.</p>
</div>
```

### اعلان‌ها

```typescript
// src/i18n/fa/notifications.ts
typeCrawlComplete: 'خزش تکمیل شد'
crawlCompletedMessage: 'خزش "{name}" تکمیل شد'
```

## اسکریپت حسابرسی i18n

### اجرا

```bash
npm run i18n:audit
```

این اسکریپت:

1. همه کلیدهای ترجمه را از `src/i18n/fa/` جمع‌آوری می‌کند
2. کدهای منبع را برای رشته‌های ترجمه نشده بررسی می‌کند
3. گزارشی از پوشش ترجمه تولید می‌کند
4. در صورت وجود رشته انگلیسی سخت‌کد شده، خطا می‌دهد

### خروجی نمونه

```
✅ ترجمه‌های موجود: ۱۲۴۷ کلید
✅ پوشش: ۱۰۰٪
✅ رشته‌های سخت‌کد نشده: ۰
✅ RTL: فعال
✅ فونت فارسی: Vazirmatn
```

## چک‌لیست فارسی‌سازی

- [x] `<html lang="fa" dir="rtl">`
- [x] فونت Vazirmatn
- [x] تقویم فارسی (Intl.DateTimeFormat fa-IR-u-ca-persian)
- [x] اعداد فارسی
- [x] واحد پول تومان/ریال
- [x] ترجمه کامل UI (۲۰ ماژول)
- [x] RTL logical properties
- [x] PDF RTL
- [x] کاتالوگ خطاها فارسی
- [x] اعتبارسنجی فارسی
- [x] حالت‌های خالی/بارگذاری فارسی
- [x] دسترسی‌پذیری aria-label فارسی
- [x] ایمیل/اعلان فارسی
- [x] مستندات فارسی‌سازی
- [x] واژه‌نامه
- [x] اسکریپت i18n:audit

## واژه‌نامه

به `docs/PERSIAN-GLOSSARY.md` مراجعه کنید.

## تست RTL

### E2E

```typescript
// tests/e2e/rtl.test.ts
test('صفحه باید RTL باشد', async ({ page }) => {
  await page.goto('/');
  const dir = await page.getAttribute('html', 'dir');
  expect(dir).toBe('rtl');
  
  const lang = await page.getAttribute('html', 'lang');
  expect(lang).toBe('fa');
});
```

### تقویم فارسی

```typescript
test('تقویم فارسی', async ({ page }) => {
  await page.goto('/reports');
  // بررسی نمایش تاریخ فارسی
  const dateElement = page.locator('[data-testid="persian-date"]');
  await expect(dateElement).toContainText('۱۴۰۳');
});
```

## منابع

- [Vazirmatn Font](https://github.com/rastikerdar/vazirmatn)
- [Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
- [RTL CSS](https://rtlstyling.com/posts/rtl-styling)
- [Persian Calendar](https://en.wikipedia.org/wiki/Solar_Hijri_calendar)
