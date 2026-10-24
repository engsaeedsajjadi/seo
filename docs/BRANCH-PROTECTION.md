# راهنمای فعال‌سازی Branch Protection — الزامی برای Production Ready

**وضعیت فعلی:** `protected: false` — نیاز به فعال‌سازی دستی در GitHub UI (محدودیت GitHub App)

## چرا Branch Protection الزامی است؟

بدون Branch Protection، حتی اگر CI سبز باشد، امکان merge کد بدون عبور تست‌ها وجود دارد. برای Production Ready باید:

- هیچ PR بدون CI سبز merge نشود
- هیچ push مستقیم بدون review نباشد
- همه 12 job الزامی باشند

## مراحل فعال‌سازی دستی (2 دقیقه)

### 1. رفتن به تنظیمات

```
https://github.com/engsaeedsajjadi/seo/settings/branches
```

### 2. Add classic branch protection rule

- **Branch name pattern:** `arena/01a0ab8c-seo` (یا `main` و `production-ready-seo-saas-aca82`)
- **Protect matching branches:** تیک

### 3. Required status checks

تیک **Require status checks to pass before merging**

- **Require branches to be up to date:** تیک
- **Status checks that are required:**

```
Lockfile Integrity
Frontend Build & Typecheck
API Build
Worker Build
MCP Build
Lint & Typecheck
Unit Tests
Security Tests
Integration & Database Security Tests
E2E Tests (Playwright Real Browser)
Docker Build & Runtime
Security Scan
```

> **نکته:** نام jobها دقیقاً باید همین باشد — از `docs/CI-FIXED.yml` کپی شده

### 4. دیگر تنظیمات پیشنهادی

- **Require pull request reviews:** 1 review (برای main)
- **Require conversation resolution:** تیک
- **Do not allow bypassing:** تیک (برای main)
- **Allow force pushes:** غیرفعال
- **Allow deletions:** غیرفعال

### 5. Save

## تلاش خودکار (ناموفق به دلیل Permission)

```bash
gh api PUT repos/engsaeedsajjadi/seo/branches/arena/01a0ab8c-seo/protection \
  -f required_status_checks='{"strict":true,"checks":[{"context":"Lockfile Integrity"},...]}'

→ 403 Resource not accessible by integration
```

GitHub App Arena مجوز `admin` برای Branch Protection ندارد — باید دستی در UI انجام شود.

## تأیید فعال‌سازی

```bash
gh api repos/engsaeedsajjadi/seo/branches/arena/01a0ab8c-seo --jq '{protected: .protected, protection: .protection.required_status_checks}'

# قبل:
{"protected":false,"protection":{"enabled":false,"required_status_checks":{"checks":[]}}}

# بعد (مورد انتظار):
{"protected":true,"protection":{"enabled":true,"required_status_checks":{"checks":[{"context":"Lockfile Integrity"},...]}}}
```

## ارتباط با Production Ready

| معیار | وضعیت بدون Protection | وضعیت با Protection |
|-------|----------------------|---------------------|
| CI سبز الزامی | ❌ اختیاری | ✅ الزامی |
| جلوگیری از merge معیوب | ❌ ندارد | ✅ دارد |
| Production Gate | ❌ قابل دور زدن | ✅ غیرقابل دور زدن |
| Audit | ❌ ناقص | ✅ کامل |

**بدون Branch Protection، حتی با CI سبز، Production Ready کامل نیست.**

## اسکریپت کمکی (برای Admin)

اگر دسترسی Admin دارید:

```bash
# نصب gh CLI و login
gh auth login

# فعال‌سازی
gh api -X PUT repos/engsaeedsajjadi/seo/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "checks": [
      {"context": "Lockfile Integrity"},
      {"context": "Frontend Build & Typecheck"},
      {"context": "API Build"},
      {"context": "Worker Build"},
      {"context": "MCP Build"},
      {"context": "Lint & Typecheck"},
      {"context": "Unit Tests"},
      {"context": "Security Tests"},
      {"context": "Integration & Database Security Tests"},
      {"context": "E2E Tests (Playwright Real Browser)"},
      {"context": "Docker Build & Runtime"},
      {"context": "Security Scan"}
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1
  },
  "restrictions": null
}
JSON

# تأیید
gh api repos/engsaeedsajjadi/seo/branches/main --jq '.protected'
```

## نتیجه

پس از فعال‌سازی:

- ✅ هر push به branch باید 12 job را PASS کند
- ✅ هیچ PR بدون CI سبز merge نمی‌شود
- ✅ Production Ready Gate کامل می‌شود

**این مرحله P2 است اما برای Production Ready نهایی الزامی است.**
