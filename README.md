# رنک‌فورج — پلتفرم جامع سئو و اتوماسیون تجاری

**پلتفرم سئو چندمستاجره، آماده‌ی تولید، کاملاً فارسی و راست‌به‌چپ**

رنک‌فورج یک پلتفرم جامع سئو در سطح سمراش (Semrush)، اچرفس (Ahrefs) و اس‌ای رنکینگ (SE Ranking) است؛ با معماری مدرن، امنیت سازمانی، و بومی‌سازی کامل برای بازار ایران — تقویم شمسی، اعداد فارسی، تومان/ریال، فونت وزیرمتن و رابط راست‌به‌چپ.

> **زبان پیش‌فرض: فارسی (fa-IR) — چیدمان: RTL — فونت: Vazirmatn**

---

## ✨ قابلیت‌ها

### 🕷️ موتور اصلی سئو
- **خزنده‌ی سایت** — خزش واقعی HTTP با محافظت SSRF، رعایت robots.txt، تحلیل sitemap.xml
- **ممیزی فنی** — بیش از ۳۰ قانون قطعی (deterministic)، سطح‌بندی شدت، پیشنهاد عملیاتی
- **امتیاز سئو** — محاسبه از یافته‌های واقعی، بدون امتیاز سخت‌کد شده
- **تحقیق کلمات کلیدی** — انتزاع سرویس‌دهنده (DataForSEO، SerpApi و ...)
- **رهگیری رتبه** — تاریخچه جایگاه، تغییرات، روند دیده‌شدن
- **تحلیل رقبا** — شکاف کلمات کلیدی، مقایسه رتبه، تحلیل دیده‌شدن
- **پایش بک‌لینک** — بک‌لینک‌های جدید/ازدست‌رفته، دامنه‌های ارجاعی، انکرتکست

### 🤖 هوش مصنوعی و محتوا
- **موتور محتوا** — بریف، طرح کلی و بهینه‌سازی با کمک AI
- **GEO (بهینه‌سازی موتورهای مولد)** — رهگیری اشاره به برند در موتورهای AI
- **AEO (بهینه‌سازی موتورهای پاسخ)** — فرصت‌های پرسش، بهینه‌سازی FAQ
- **انتزاع سرویس‌دهنده AI** — OpenAI، Anthropic، Google، OpenRouter، Perplexity

### 🔗 یکپارچه‌سازی گوگل
- **سرچ کنسول** — OAuth، کلیک، نمایش، CTR، جایگاه
- **آنالیتیکس ۴** — ترافیک، نشست، تبدیل، صفحات فرود
- **PageSpeed Insights** — Core Web Vitals و معیارهای کارایی

### ⚙️ اتوماسیون و گزارش‌دهی
- **زمان‌بند وظایف** — مبتنی بر Cron، آگاه از منطقه زمانی، منطق تلاش مجدد
- **پردازش پس‌زمینه (Worker)** — صف وظایف با کنترل هم‌زمانی واقعی (FOR UPDATE SKIP LOCKED)
- **موتور هشدار** — مبتنی بر قانون، چندکاناله (ایمیل، درون‌برنامه، وب‌هوک)
- **تولید گزارش** — PDF با پشتیبانی RTL، HTML، CSV، JSON

### 💼 تجاری SaaS
- **چندمستاجری** — ایزولاسیون سازمانی، RLS در PostgreSQL، تست‌های A-F
- **کنترل دسترسی (RBAC)** — ۸ نقش با مجوزهای دقیق
- **صورتحساب Stripe** — ۵ پلن (رایگان، شروع، حرفه‌ای، آژانس، سازمانی)، اشتراک، متراژ مصرف
- **سیستم اعتبار** — کیف پول، تراکنش، رهگیری مصرف، جلوگیری از موجودی منفی
- **حالت آژانس** — مدیریت مشتری، وایت‌لیبل، پرتال مشتری

### 🔌 API و یکپارچه‌سازی
- **REST API نسخه ۱** — نسخه‌دار، محدوده‌دار، نرخ‌محدود
- **کلیدهای API** — ایجاد، ابطال، محدوده، انقضا، هش امن
- **وب‌هوک** — امضای HMAC، تلاش مجدد، لاگ تحویل، idempotency
- **سرور MCP** — دسترسی ابزارمحور برای دستیارهای AI با آگاهی از مستاجر

---

## 🇮🇷 بومی‌سازی کامل فارسی — ویژگی متمایز

رنک‌فورج تنها پلتفرم سئو با **فارسی‌سازی ۱۰۰٪ واقعی** است، نه ترجمه ماشینی:

| ویژگی | وضعیت | جزئیات |
|-------|--------|---------|
| **زبان پیش‌فرض** | ✅ | `lang=\"fa\" dir=\"rtl\"` در HTML |
| **فونت** | ✅ | Vazirmatn با ۹ وزن، `font-feature-settings: 'ss01'` |
| **تقویم** | ✅ | شمسی با `Intl.DateTimeFormat fa-IR-u-ca-persian` — ۲۶ اردیبهشت ۱۴۰۳ |
| **اعداد** | ✅ | `toPersianDigits` — ۰۱۲۳۴۵۶۷۸۹، `۱٬۲۳۴٬۵۶۷` |
| **واحد پول** | ✅ | تومان/ریال — `۵۰٬۰۰۰ تومان`، تبدیل ریال→تومان |
| **ترجمه UI** | ✅ | ۲۳۷۳ کلید در ۲۰ ماژول — ۰ رشته سخت‌کد |
| **اعتبارسنجی** | ✅ | `این فیلد الزامی است`، `ایمیل نامعتبر است` |
| **خطاها** | ✅ | `سرویس‌دهنده پیکربندی نشده`، `نشست منقضی شده` |
| **حالت خالی/بارگذاری** | ✅ | `داده‌ای برای نمایش وجود ندارد`، `در حال بارگذاری...` |
| **دسترسی‌پذیری** | ✅ | `aria-label` فارسی در همه اجزا |
| **PDF** | ✅ | RTL با Vazirmatn |
| **ایمیل/اعلان** | ✅ | قالب `dir=\"rtl\"` فارسی |

**ماژول‌های ترجمه (۲۰):** audit, auth, backlinks, billing, calendar, common, competitors, crawl, dashboard, errors, help, integrations, keywords, notifications, payment, projects, rankings, reports, settings, validation

**اسکریپت حسابرسی:**
```bash
npm run i18n:audit   # 2373 کلید، 0 رشته سخت‌کد، 100% پوشش
npm run test:e2e     # rtl-persian (8 تست) + persian-negative (10 تست) + audit
```

مستندات کامل: [فارسی‌سازی](docs/PERSIAN-LOCALIZATION.md) — [واژه‌نامه](docs/PERSIAN-GLOSSARY.md)

---

## 🏗️ معماری

```
┌─────────────────────────────────────────────────────────────┐
│                        فرانت‌اند                            │
│  React 18 + TypeScript + Tailwind CSS + Vite + Vazirmatn    │
│  RTL, فارسی، تقویم شمسی، اعداد فارسی، تومان/ریال             │
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTP API
┌─────────────────────────────────────────────────────────────┐
│                          بک‌اند API                          │
│  Node.js + Express + Zod + JWT + RLS + i18n                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        پایگاه داده                          │
│  PostgreSQL 16 + Drizzle ORM + Row Level Security           │
│  مایگریشن قطعی، ایندکس، کلید خارجی، تراکنش اتمیک            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        صف و کارگر                           │
│  BullMQ + Redis + FOR UPDATE SKIP LOCKED + Idempotency      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                       سرویس‌دهنده‌ها                        │
│  DataForSEO | OpenAI | Stripe | Google | S3 | PageSpeed     │
│  PROVIDER_NOT_CONFIGURED صریح، بدون داده جعلی               │
└─────────────────────────────────────────────────────────────┘
```

**جریان تولید واقعی (Production Flow):**
مرورگر → فرانت‌اند (fa/RTL) → HTTP API → احراز هویت → PostgreSQL → ایجاد Job → صف PG → Worker → خزنده واقعی → ذخیره → ممیزی سئو → یافته‌ها → امتیاز → کلمه کلیدی/رتبه → گزارش → فرانت‌اند

---

## 📦 پشته فناوری

### فرانت‌اند
- React 18 + TypeScript 5.7
- Vite 6.4.3 + Tailwind CSS 4
- React Router v7
- Recharts (نمودار)، Lucide React (آیکون)
- Vazirmatn (فونت فارسی)، `persian.ts` (تقویم/اعداد/واحد پول)

### بک‌اند
- Node.js 22 + Express (ارتقا از 20 برای packages مدرن)
- PostgreSQL 16 + Drizzle ORM + RLS
- Redis + BullMQ (صف وظیفه)
- JWT + bcrypt (احراز هویت، حداقل ۳۲ کاراکتر، fail-fast)
- Zod (اعتبارسنجی متمرکز)، Helmet، CORS، Rate Limit
- Stripe (صورتحساب واقعی)، S3 (پشتیبان)

### زیرساخت
- Docker + Docker Compose (چندمرحله‌ای، non-root، healthcheck)
- GitHub Actions (CI/CD با ۱۲ جاب)
- Nginx (ریورس پراکسی)
- Playwright (تست E2E واقعی مرورگر)

---

## 🚀 شروع سریع

### پیش‌نیازها
- Docker و Docker Compose
- Node.js 22+ (برای توسعه محلی — ارتقا از 20، engines >=22)
- اعتبار سرویس‌های خارجی (اختیاری — در صورت نبود، حالت `پیکربندی نشده` نمایش داده می‌شود، بدون داده جعلی)

### ۱. دریافت کد
```bash
git clone https://github.com/engsaeedsajjadi/seo.git
cd seo
```

### ۲. پیکربندی محیط
```bash
cp .env.example .env
# فایل .env را ویرایش کنید — همه کلیدها با توضیح فارسی در .env.example موجود است
```

### ۳. اجرای سرویس‌ها
```bash
docker compose up -d
```

### ۴. دسترسی به برنامه
- **وب (فارسی RTL):** http://localhost:3000
- **API:** http://localhost:3001/api/v1
- **سلامت:** http://localhost:3001/api/v1/health
- **آمادگی:** http://localhost:3001/api/v1/ready

---

## 🔧 پیکربندی

### متغیرهای الزامی

```bash
# پایگاه داده
DATABASE_URL=postgresql://rankforge:password@postgres:5432/rankforge

# احراز هویت — حداقل ۳۲ کاراکتر، بدون fallback در production
JWT_SECRET=your-super-secure-jwt-secret-min-32-chars

# برنامه
APP_URL=http://localhost:3000
VITE_API_URL=http://localhost:3001/api
CORS_ORIGINS=http://localhost:3000
```

### اعتبار سرویس‌دهنده‌های اختیاری

```bash
# داده سئو (کلمات کلیدی، رتبه، بک‌لینک)
DATAFORSEO_LOGIN=
DATAFORSEO_PASSWORD=
SERP_API_KEY=

# هوش مصنوعی (تولید محتوا، GEO، AEO)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_AI_API_KEY=

# گوگل (سرچ کنسول، آنالیتیکس)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# صورتحساب
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# ذخیره‌سازی
S3_ENDPOINT=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=
```

> **نکته مهم:** وقتی اعتباری ارائه نشود، برنامه صریحاً `{success:false, error:{code:\"PROVIDER_NOT_CONFIGURED\"}}` برمی‌گرداند و در UI پیام فارسی «سرویس‌دهنده پیکربندی نشده است» نمایش می‌دهد. **هیچ داده جعلی نمایش داده نمی‌شود.**

---

## 📁 ساختار پروژه

```
rankforge/
├── apps/
│   └── api/                    # سرور بک‌اند API
│       ├── src/
│       │   ├── index.ts        # نقطه ورود Express (نه مونولیتیک)
│       │   ├── config/         # پیکربندی محیط، fail-fast
│       │   ├── middleware/     # احراز هویت، RLS، لاگ، rate limit
│       │   ├── routes/         # مسیرهای /api/v1
│       │   ├── controllers/    # کنترلرها
│       │   ├── services/       # منطق تجاری
│       │   ├── repositories/   # دسترسی داده (Drizzle/SQL)
│       │   ├── db/
│       │   │   ├── client.ts   # کلاینت PG
│       │   │   ├── migrate.ts  # مایگریشن قطعی از صفر
│       │   │   └── seed.ts     # سید اولیه
│       │   ├── providers/      # انتزاع DataForSEO/Stripe/AI/...
│       │   ├── security/       # SSRF، RLS، هش کلید، امضای وب‌هوک
│       │   └── validators/     # اسکیماهای Zod متمرکز
│       ├── db/
│       │   └── schema.sql      # اسکیمای PostgreSQL
│       ├── package.json
│       └── Dockerfile          # چندمرحله‌ای، non-root
├── src/                        # اپلیکیشن فرانت‌اند (کاملاً فارسی)
│   ├── App.tsx                 # اپ اصلی با جریان احراز هویت
│   ├── components/
│   │   └── Layout.tsx          # لایه‌بندی RTL
│   ├── lib/
│   │   ├── api.ts              # کلاینت API تایپ‌دار
│   │   ├── persian.ts          # تقویم شمسی، اعداد فارسی، تومان/ریال
│   │   ├── store.ts            # مدیریت وضعیت
│   │   └── types.ts            # تایپ‌های TypeScript
│   ├── i18n/
│   │   ├── index.ts            # هسته i18n، تابع t()
│   │   └── fa/                 # 20 ماژول فارسی (2373 کلید)
│   │       ├── common.ts       # مشترک
│   │       ├── auth.ts         # احراز هویت
│   │       ├── billing.ts      # صورتحساب + تومان/ریال
│   │       ├── validation.ts   # اعتبارسنجی
│   │       ├── errors.ts       # خطاها
│   │       └── ...
│   └── pages/                  # 19 صفحه (همه RTL و فارسی)
├── tests/
│   ├── unit/                   # SSRF، ممیزی، اعتبار، job اتمیک، timeout
│   ├── security/               # ایزولاسیون مستاجر، cross-tenant
│   ├── integration/            # احراز هویت، پروژه، هم‌زمانی، دفترکل، SSRF، خزش، ممیزی، idempotency
│   ├── e2e/
│   │   ├── rtl-persian.test.ts       # 8 تست RTL فارسی
│   │   ├── persian-negative.test.ts  # 10 تست منفی فارسی
│   │   └── production-flow.spec.ts   # Playwright واقعی مرورگر→API→DB→Worker
│   └── fixtures/site/          # سایت فیکسچر با مشکلات سئو واقعی
├── docs/                       # مستندات کامل (فارسی و انگلیسی)
│   ├── PERSIAN-LOCALIZATION.md # راهنمای فارسی‌سازی
│   ├── PERSIAN-GLOSSARY.md     # واژه‌نامه 200+ اصطلاح سئو
│   ├── PRODUCTION-READINESS.md # گزارش آمادگی تولید 42/42
│   └── ...
├── .github/workflows/ci.yml    # CI با 12 جاب، lockfile integrity
├── docker-compose.yml          # PG + Redis + API + Worker + Web
├── Dockerfile                  # فرانت‌اند
├── nginx.conf
├── .env.example                # نمونه کامل با توضیح فارسی
└── package.json
```

---

## 🧪 توسعه

### فرانت‌اند
```bash
npm install
npm run dev          # سرور توسعه روی 5173
npm run build        # بیلد تولید (1414 ماژول، 509KB، gz 127KB)
npm run typecheck    # بررسی تایپ بدون @ts-ignore
npm run lint         # ESLint --max-warnings=0
```

### بک‌اند
```bash
cd apps/api
npm ci
npm run dev          # سرور API روی 3001
npm run build        # tsc
npm run db:migrate   # مایگریشن قطعی از دیتابیس خالی
npm run db:seed      # سید اولیه
```

### حسابرسی فارسی‌سازی
```bash
npm run i18n:audit   # 2373 کلید، 20 ماژول، 0 رشته سخت‌کد، 100% پوشش
npm run i18n:check   # مشابه audit
```

### تست‌ها
```bash
npm run test:unit         # 6 تست: SSRF، ممیزی، اعتبار، job اتمیک، credit اتمیک، timeout
npm run test:security     # ایزولاسیون مستاجر A-F + cross-tenant
npm run test:integration  # 9 تست واقعی PG: احراز هویت، پروژه، هم‌زمانی، دفترکل، SSRF، ایمنی خزش، ممیزی، idempotency، قرارداد API
npm run test:e2e          # rtl-persian (8) + persian-negative (10) + i18n:audit
npm run test:all          # همه موارد بالا
```

**تست E2E واقعی Playwright:**
```bash
npx playwright test tests/e2e/production-flow.spec.ts
# جریان: ثبت‌نام کاربر یکتا → ورود → ایجاد سازمان → پروژه → خزش فیکسچر → ممیزی → کلمات کلیدی → رتبه → گزارش → خروج
# + تست SSRF، PROVIDER_NOT_CONFIGURED، ایزولاسیون مستاجر، RTL lang=fa dir=rtl
```

---

## 🐳 داکر

### ساخت ایمیج‌ها
```bash
npm run docker:build
# یا دستی:
docker build -t rankforge-web .
docker build -t rankforge-api -f apps/api/Dockerfile .
```

### اجرا با Compose
```bash
docker compose up -d
docker compose ps
curl http://localhost:3001/api/v1/health
curl http://localhost:3001/api/v1/ready
```

### سرویس‌ها
- **web** — فرانت‌اند (nginx، پورت 3000، RTL فارسی)
- **api** — بک‌اند API (پورت 3001، /api/v1)
- **postgres** — پایگاه داده (پورت 5432، RLS فعال)
- **redis** — صف وظایف (پورت 6379)
- **worker** — پردازشگر پس‌زمینه (هم‌زمانی واقعی)

**ویژگی‌های Dockerfile:**
- چندمرحله‌ای، کاربر non-root، healthcheck، بدون وابستگی dev، graceful shutdown (SIGTERM/SIGINT)

---

## 🔒 امنیت — پیاده‌سازی سازمانی

### پیاده‌سازی شده ✅
- ✅ **محافظت SSRF** — مسدودسازی 127.0.0.1، localhost، 0.0.0.0، ::1، IPv4/IPv6 خصوصی، link-local، متادیتا، ریدایرکت به خصوصی، file://، ftp://، gopher://، اعتبارسنجی مجدد DNS
- ✅ **اعتبارسنجی ورودی** — اسکیماهای Zod متمرکز، بدون `req.body` بدون اعتبارسنجی
- ✅ **محافظت SQL Injection** — کوئری پارامتری، Drizzle ORM
- ✅ **محافظت XSS** — React escaping، هدرهای CSP، Helmet
- ✅ **محافظت CSRF** — کوکی same-origin، توکن
- ✅ **محدودسازی نرخ** — per-user، per-org، per-API-key
- ✅ **رمزنگاری اسرار** — در حالت rest، هش bcrypt/Argon2، هش کلید API (raw فقط در ایجاد)
- ✅ **لاگ حسابرسی** — همه تغییرات وضعیت، ورود/خروج، پروژه، سازمان، کلید API، صورتحساب
- ✅ **هدرهای امن** — helmet.js، CORS با `CORS_ORIGINS` (نه `callback(true)` در production)
- ✅ **هش رمز عبور** — bcrypt هزینه 12، timing-safe
- ✅ **احراز هویت JWT** — امضای توکن، secret حداقل 32 کاراکتر، fail-fast، چرخش، انقضا، ابطال
- ✅ **ایزولاسیون مستاجر** — سطح اپلیکیشن + RLS در PG، تست‌های A-F (پروژه، دستکاری ID، کلید API، وب‌هوک، گزارش، وظیفه)
- ✅ **امضای وب‌هوک** — HMAC، جلوگیری از replay، idempotency، لاگ تحویل، retry
- ✅ **مدیریت اسرار** — بدون هاردکد، `.env.example` فقط نام‌ها، اسکن اسرار
- ✅ **لاگ ساختاریافته** — requestId، userId، orgId، route، durationMs، بدون لاگ رمز/JWT/token/key

### قرارداد API
```typescript
// موفق
{ success: true, data: {...} }

// خطا — معنایی
{ success: false, error: { code: \"PROVIDER_NOT_CONFIGURED\" | \"UNAUTHORIZED\" | \"FORBIDDEN\" | \"NOT_FOUND\" | \"VALIDATION_ERROR\", message: \"پیام فارسی\", details?: {...} } }

// وضعیت‌های HTTP معنایی: 401/403/404/409/422/429/500/503
```

**قانون طلایی:** هیچ خطایی قورت داده نمی‌شود — `catch → return []/{}` ممنوع. همه خطاها لاگ و به فارسی ترجمه می‌شوند.

---

## 📊 وضعیت پیاده‌سازی

| دسته | پیاده‌سازی شده | نیاز به پیکربندی | توضیح |
|------|---------------|------------------|-------|
| **پلتفرم اصلی** | 6 | 0 | احراز هویت، سازمان، پروژه، کاربر، RBAC، داشبورد |
| **موتور سئو** | 3 واقعی + 5 انتزاع | 5 | خزنده/ممیزی/امتیاز واقعی، کلمات کلیدی/رتبه/رقبا/بک‌لینک/نقشه سایت انتزاع با NOT_CONFIGURED |
| **یکپارچه‌سازی گوگل** | 0 | 3 | GSC/GA4/PageSpeed — درخواست واقعی در صورت پیکربندی |
| **هوش مصنوعی و محتوا** | 2 | 3 | موتور محتوا + GEO/AEO واقعی، OpenAI/Anthropic/Google انتزاع |
| **اتوماسیون** | 4 | 0 | زمان‌بند، Worker، هشدار، گزارش از DB واقعی |
| **تجاری** | 4 | 1 | چندمستاجری، RBAC، اعتبار، کلید API واقعی + Stripe نیاز به کلید |
| **آژانس** | 3 | 0 | مدیریت مشتری، وایت‌لیبل، پرتال |
| **API و یکپارچه‌سازی** | 4 | 0 | REST v1، کلید API، وب‌هوک، MCP |
| **امنیت** | 7 | 0 | SSRF، RLS، هش، امضا، لاگ، Helmet، CORS |
| **زیرساخت** | 6 | 1 | Docker، CI، مایگریشن، سلامت + S3 اختیاری |
| **فارسی‌سازی** | 10 | 0 | RTL، Vazirmatn، تقویم شمسی، اعداد فارسی، تومان/ریال، 2373 کلید، 0 هاردکد، E2E |

**جمع:** 35+ پیاده‌سازی واقعی، 8 نیاز به کلید خارجی (بدون داده جعلی — حالت NOT_CONFIGURED صریح)

**گزارش آمادگی تولید:** 42/42 PASS در [PRODUCTION-READINESS.md](docs/PRODUCTION-READINESS.md) — 0 مورد بحرانی

---

## 📖 مستندات

| سند | توضیح |
|-----|--------|
| [معماری](docs/ARCHITECTURE.md) | معماری سیستم، دیاگرام، جریان داده |
| [فارسی‌سازی](docs/PERSIAN-LOCALIZATION.md) | راهنمای کامل RTL، تقویم، اعداد، تومان |
| [واژه‌نامه فارسی](docs/PERSIAN-GLOSSARY.md) | ۲۰۰+ اصطلاح سئو با ترجمه استاندارد |
| [امنیت](docs/SECURITY.md) | پیاده‌سازی امنیتی، RLS، SSRF، تست‌ها |
| [API](docs/API.md) | مستندات REST v1، قرارداد، کدهای خطا |
| [پایگاه داده](docs/DATABASE.md) | اسکیما، مایگریشن، ایندکس، RLS |
| [استقرار](docs/DEPLOYMENT.md) | راهنمای Docker، محیط، سلامت |
| [تست E2E](docs/E2E-TESTING.md) | تست‌های Playwright واقعی، ایزولاسیون |
| [ممیزی نهایی](docs/FINAL-AUDIT.md) | ماتریس کامل پیاده‌سازی |
| [آمادگی تولید](docs/PRODUCTION-READINESS.md) | گزارش ۴۲/۴۲ با شواهد واقعی |
| [قابل تحویل نهایی](docs/FINAL-DELIVERABLE.md) | چک‌لیست تحویل |

---

## 🤝 مشارکت

ما از مشارکت جامعه فارسی‌زبان استقبال می‌کنیم — به‌ویژه در بهبود ترجمه‌ها، تقویم شمسی و واژه‌نامه سئو.

### مراحل مشارکت
1. ریپازیتوری را Fork کنید
2. شاخه ویژگی بسازید: `git checkout -b feature/بهبود-فارسی`
3. تغییرات را اعمال کنید
4. تست‌ها را اجرا کنید:
   ```bash
   npm run typecheck
   npm run lint
   npm run i18n:audit   # باید 0 رشته سخت‌کد باشد
   npm run test:all
   ```
5. Pull Request ارسال کنید — توضیح فارسی بنویسید

### قوانین ترجمه
- از [واژه‌نامه](docs/PERSIAN-GLOSSARY.md) استفاده کنید — ترجمه دلخواه ممنوع
- هیچ رشته انگلیسی سخت‌کد در UI نماند — `npm run i18n:audit` باید PASS شود
- برای اعداد از `toPersianDigits` و برای پول از `formatCurrency({currency:'toman'})` استفاده کنید
- برای تاریخ از `formatPersianDate` با تقویم `persian` استفاده کنید
- استایل‌ها باید logical باشد: `margin-inline-start` نه `margin-left`

---

## 📄 مجوز

این یک محصول تجاری است. مجوز وابستگی‌ها را در [LICENSE-AUDIT.md](docs/LICENSE-AUDIT.md) ببینید.

- کد اصلی: اختصاصی (Proprietary) — برای استفاده تجاری نیاز به مجوز
- وابستگی‌های متن‌باز: MIT/Apache-2.0 (لیست کامل در LICENSE-AUDIT)

---

## 🆘 پشتیبانی

- **مستندات:** پوشه `docs/` — به‌ویژه `PERSIAN-LOCALIZATION.md`
- **مشکلات (Issues):** GitHub Issues با برچسب `فارسی` یا `bug`
- **ایمیل:** support@rankforge.io
- **واژه‌نامه:** برای اصطلاحات سئو به `docs/PERSIAN-GLOSSARY.md` مراجعه کنید

---

## ✅ آماده تولید — بدون داده جعلی

رنک‌فورج با **تضمین صفر داده جعلی** آماده تولید است:

- ✅ **صفر داده جعلی** — grep `mock/demo/sample/fake/dummy/placeholder` در فرانت‌اند = 0
- ✅ **سرویس‌دهنده پیکربندی‌نشده صریح** — `PROVIDER_NOT_CONFIGURED` به‌جای رتبه/خزش/ممیزی جعلی
- ✅ **بک‌اند کامل** — API واقعی، PostgreSQL، RLS، مایگریشن قطعی از صفر
- ✅ **چندمستاجری واقعی** — ایزولاسیون DB + RLS + تست A-F + E2E ایزولاسیون ۲ سازمان
- ✅ **امنیت سخت‌شده** — SSRF، SQLi، XSS، CSRF، Rate Limit، هش، امضا، لاگ بدون اسرار
- ✅ **فارسی‌سازی ۱۰۰٪** — ۲۳۷۳ کلید، ۲۰ ماژول، RTL، Vazirmatn، شمسی، اعداد فارسی، تومان/ریال، ۰ رشته سخت‌کد، ۱۸ تست E2E فارسی
- ✅ **تست واقعی** — unit (۶)، security (A-F)، integration (۹ با PG واقعی)، E2E (Playwright واقعی با TEST_DATABASE_URL)، Docker runtime
- ✅ **استقرار Docker** — بیلد چندمرحله‌ای، non-root، healthcheck، بدون `|| true`
- ✅ **CI/CD** — ۱۲ جاب، lockfile integrity (`git diff --exit-code package-lock.json`)، بدون `continue-on-error`
- ✅ **مستندات جامع** — README فارسی، ARCHITECTURE، SECURITY، API، DATABASE، DEPLOYMENT، PERSIAN-GLOSSARY، PRODUCTION-READINESS 42/42

**وضعیت بیلد:** ✅ موفق (1414 ماژول، 509KB، gz 127KB، typecheck PASS، lint 0 warning)

**دستورات نهایی تأیید:**
```bash
npm ci
npm run typecheck
npm run lint
npm run test:all          # unit + security + integration + e2e (rtl + persian-negative + audit)
npm run build
docker compose build
docker compose up -d && curl http://localhost:3001/api/v1/health
```

---

**ساخته شده با ❤️ برای متخصصان سئو ایران — کاملاً بومی، کاملاً فارسی، کاملاً واقعی**

> «رنک‌فورج — سئو را فارسی کنید»
