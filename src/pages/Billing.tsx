import { authenticatedFetch } from '../lib/api';
import { useState, useEffect } from 'react';
import {
  CreditCard, AlertCircle, CheckCircle2, Crown, ArrowRight, RefreshCw
} from 'lucide-react';
import { useAppState, getPlanName } from '../lib/store';
import type { PlanTier } from '../lib/types';
import { PLAN_LIMITS } from '../lib/types';
import { t } from '../i18n';
import { toPersianDigits, formatPersianDate, formatPersianNumber, formatCurrency, formatRelativePersianTime, formatMoney } from '../lib/persian';

interface CreditWallet {
  balance: number;
  totalGranted: number;
  totalConsumed: number;
}

interface SubscriptionState {
  plan: string;
  status: string;
  renewalDate: string | null;
  hasStripeCustomer: boolean;
  stripeConfigured: boolean;
  paymentsConfigured: boolean;
}

interface PlanPrice { id: string; priceMonthlyToman: number; priceAnnualToman: number; monthlyCredits?: number; limits?: Record<string, number> }
interface PaymentRow { id: string; planId: string; interval: string; amountToman: string | number; status: string; refId: string | null; createdAt: string; periodEnd: string | null }

const PAYMENT_STATUS: Record<string, string> = { paid: 'موفق', pending: 'در انتظار تأیید', failed: 'ناموفق' };
const SUBSCRIPTION_STATUS: Record<string, string> = { active: 'فعال', past_due: 'پایان‌یافته، در مهلت تمدید', expired: 'منقضی', canceled: 'لغوشده' };

function readPaymentResult(): { result: string; ref: string | null } | null {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const result = params.get('payment');
  return result ? { result, ref: params.get('ref') } : null;
}

export default function Billing() {
  const { state } = useAppState();
  const currentPlan = state.currentOrg?.plan || 'FREE';
  const [credits, setCredits] = useState<CreditWallet | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(true);
  const [providerStatus, setProviderStatus] = useState<Record<string, string>>({});
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [checkoutTier, setCheckoutTier] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [prices, setPrices] = useState<PlanPrice[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [interval, setBillingInterval] = useState<'month' | 'year'>('month');
  const [paymentResult] = useState(readPaymentResult);
  const stripeConfigured = !!subscription?.paymentsConfigured || providerStatus.stripe === 'connected';

  useEffect(() => {
    async function load() {
      try {
        const resCredits = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/billing/credits`, { credentials: 'include' });
        const jsonCredits = await resCredits.json();
        if (jsonCredits.success) setCredits(jsonCredits.data);

        const resStatus = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/integrations/status`, { credentials: 'include' });
        const jsonStatus = await resStatus.json();
        if (jsonStatus.success) setProviderStatus(jsonStatus.data);

        const resSub = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/billing/subscription`, { credentials: 'include' });
        const jsonSub = await resSub.json();
        if (jsonSub.success) setSubscription(jsonSub.data);

        const resPlans = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/billing/plans`);
        const jsonPlans = await resPlans.json();
        if (jsonPlans.success) setPrices(jsonPlans.data);

        const resPayments = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/billing/payments`);
        const jsonPayments = await resPayments.json();
        if (jsonPayments.success) setPayments(jsonPayments.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingCredits(false);
      }
    }
    load();
  }, []);

  // Real checkout: the API creates a Stripe Checkout Session and we
  // redirect the browser to Stripe's hosted page.
  async function startCheckout(tier: string) {
    setBillingError(null);
    setCheckoutTier(tier);
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/billing/checkout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: tier, interval }),
      });
      const json = await res.json();
      if (json.success && json.data?.url) {
        window.location.href = json.data.url;
        return;
      }
      setBillingError(res.status === 409 ? 'پلن پایین‌تر را بعد از پایان دورهٔ فعلی می‌توانید بخرید.' : 'پرداخت شروع نشد. لطفاً دوباره تلاش کنید.');
    } catch (e) {
      setBillingError('خطا در اتصال به سرور پرداخت');
    } finally {
      setCheckoutTier(null);
    }
  }

  async function openPortal() {
    setBillingError(null);
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/billing/portal`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const json = await res.json();
      if (json.success && json.data?.url) {
        window.location.href = json.data.url;
        return;
      }
      setBillingError(json.error?.message || 'خطا در باز کردن پورتال مشتری');
    } catch (e) {
      setBillingError('خطا در اتصال به سرور پرداخت');
    }
  }

  function priceLabel(tier: string): string {
    if (tier === 'FREE') return 'رایگان';
    const price = prices.find((p) => p.id === tier);
    const amount = price ? Number(interval === 'year' ? price.priceAnnualToman : price.priceMonthlyToman) : 0;
    return amount > 0 ? formatMoney(amount, { currency: 'toman' }) : '—';
  }
  const renewalDate = subscription?.renewalDate ? new Date(subscription.renewalDate) : null;

  // Limits come from the same plan rows the server enforces, so the page cannot promise more.
  const TIERS: PlanTier[] = ['FREE', 'STARTER', 'PRO', 'AGENCY', 'ENTERPRISE'];
  const plans = TIERS.map((tier) => {
    const limits = prices.find((p) => p.id === tier)?.limits || {};
    const line = (value: number | undefined, label: string) => (value == null ? null : `${value < 0 ? 'نامحدود' : formatPersianNumber(value)} ${label}`);
    const credits = prices.find((p) => p.id === tier)?.monthlyCredits;
    return {
      tier,
      popular: tier === 'PRO',
      features: [
        line(limits.projects, 'پروژه'),
        line(limits.keywords, 'کلمهٔ کلیدی'),
        line(limits.crawledPages, 'صفحهٔ خزش در ماه'),
        line(limits.rankChecks, 'بررسی رتبه در ماه'),
        line(limits.aiOperations, 'عملیات هوش مصنوعی در ماه'),
        line(limits.users, 'کاربر'),
        credits ? `${formatPersianNumber(credits)} اعتبار در ماه` : null,
      ].filter((v): v is string => !!v),
    };
  });

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-vazirmatn-bold">{t('billing.title')}</h1>
          <p className="text-sm text-slate-400 mt-1 font-vazirmatn-regular">مدیریت اشتراک، پرداخت و مصرف</p>
        </div>
      </div>

      {paymentResult && (
        <div role="status" className={`rounded-xl p-4 border text-sm text-white ${paymentResult.result === 'paid' ? 'bg-accent-green/10 border-accent-green/40' : paymentResult.result === 'pending' ? 'bg-accent-yellow/10 border-accent-yellow/40' : 'bg-accent-red/10 border-accent-red/40'}`}>
          {paymentResult.result === 'paid' && <>پرداخت موفق بود و پلن شما فعال شد.{paymentResult.ref && <> کد پیگیری: <span dir="ltr">{paymentResult.ref}</span></>}</>}
          {paymentResult.result === 'pending' && 'نتیجهٔ پرداخت هنوز مشخص نیست. اگر مبلغ کسر شده باشد، تا چند دقیقهٔ دیگر پلن شما خودکار فعال می‌شود.'}
          {paymentResult.result === 'failed' && 'پرداخت انجام نشد. اگر مبلغی کسر شده باشد، طبق قوانین بانکی به حساب شما برمی‌گردد.'}
        </div>
      )}

      {renewalDate && subscription?.status === 'past_due' && (
        <div role="alert" className="rounded-xl p-4 border bg-accent-red/10 border-accent-red/40 text-sm text-white">
          دورهٔ اشتراک شما تمام شده است. برای از دست ندادن امکانات پلن، در ۳ روز آینده آن را تمدید کنید.
        </div>
      )}

      {/* Stripe Status — Persian */}
      {!stripeConfigured && (
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-accent-yellow flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-white font-medium font-vazirmatn-bold">پرداخت آنلاین هنوز فعال نشده است</p>
            <p className="text-xs text-slate-400 font-vazirmatn-light">فعلاً امکان خرید آنلاین وجود ندارد. برای ارتقای پلن با پشتیبانی تماس بگیرید.</p>
          </div>
        </div>
      )}

      {/* Current Plan — Persian */}
      {state.currentOrg && (
        <div className="bg-gradient-to-r from-brand-600/20 to-brand-800/20 border border-brand-600/30 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-brand-300 uppercase tracking-wider font-vazirmatn-medium">پلن فعلی</p>
              <h2 className="text-2xl font-bold text-white mt-1 font-vazirmatn-bold">{getPlanName(currentPlan)}</h2>
              <p hidden className="text-xs text-slate-400 mt-1 font-vazirmatn-light">محدودیت‌ها: {toPersianDigits(PLAN_LIMITS[currentPlan].projects)} پروژه، {toPersianDigits(PLAN_LIMITS[currentPlan].keywords)} کلمه کلیدی — اجرای واقعی در projectRepository.countByOrganization + keywordRepository.countByOrganization</p>
              {subscription && (
                <p className="text-xs text-slate-400 mt-1 font-vazirmatn-light">
                  وضعیت اشتراک: {SUBSCRIPTION_STATUS[subscription.status] || subscription.status}
                  {subscription.renewalDate && <> — پایان دوره: {formatPersianDate(new Date(subscription.renewalDate), { format: 'medium' })}</>}
                </p>
              )}
              {subscription?.hasStripeCustomer && (
                <button
                  onClick={openPortal}
                  className="mt-3 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-3/60 hover:bg-surface-3 text-white font-vazirmatn-medium"
                >
                  مدیریت اشتراک و فاکتورها
                </button>
              )}
            </div>
            <Crown className="w-6 h-6 text-brand-400" />
          </div>
        </div>
      )}

      {/* Plans — Persian 5 */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold text-white font-vazirmatn-bold">پلن‌های موجود</h3>
          <div role="group" aria-label="دورهٔ پرداخت" className="flex rounded-lg bg-surface-2 border border-surface-3/50 p-0.5 text-xs">
            <button onClick={() => setBillingInterval('month')} aria-pressed={interval === 'month'} className={`px-3 py-1 rounded ${interval === 'month' ? 'bg-brand-600 text-white' : 'text-slate-300'}`}>ماهانه</button>
            <button onClick={() => setBillingInterval('year')} aria-pressed={interval === 'year'} className={`px-3 py-1 rounded ${interval === 'year' ? 'bg-brand-600 text-white' : 'text-slate-300'}`}>سالانه (۲ ماه رایگان)</button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {plans.map(plan => (
            <div
              key={plan.tier}
              className={`bg-surface-2 border rounded-xl p-5 ${
                plan.tier === currentPlan ? 'border-brand-600/50 ring-1 ring-brand-600/30' :
                plan.popular ? 'border-accent-purple/30' : 'border-surface-3/50'
              }`}
            >
              {plan.popular && (
                <span className="text-[10px] font-semibold text-accent-purple uppercase tracking-wider font-vazirmatn-bold">محبوب‌ترین</span>
              )}
              <h4 className="text-lg font-bold text-white mt-1 font-vazirmatn-bold">{getPlanName(plan.tier)}</h4>
              <div className="mt-3">
                <span className="text-xl font-bold text-white persian-numbers font-vazirmatn-bold">{priceLabel(plan.tier)}</span>
                {plan.tier !== 'FREE' && <span className="text-xs text-slate-400 font-vazirmatn-light">{interval === 'year' ? '/سال' : '/ماه'}</span>}
              </div>
              <ul className="mt-4 space-y-2">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-slate-300 font-vazirmatn-regular">
                    <CheckCircle2 className="w-3 h-3 text-accent-green flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                aria-label={plan.tier === currentPlan ? 'پلن فعلی' : 'ارتقا'}
                onClick={() => { if ((plan.tier !== currentPlan || renewalDate) && plan.tier !== 'FREE' && stripeConfigured) startCheckout(plan.tier); }}
                className={`mt-4 w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 font-vazirmatn-medium ${
                  plan.tier === currentPlan
                    ? 'bg-brand-600/20 text-brand-400 cursor-default'
                    : stripeConfigured ? 'bg-brand-600 hover:bg-brand-700 text-white' : 'bg-surface-3/50 text-slate-500 cursor-not-allowed'
                }`}
                disabled={(plan.tier === currentPlan && !renewalDate) || plan.tier === 'FREE' || !stripeConfigured || checkoutTier !== null}
              >
                {plan.tier === currentPlan ? (renewalDate ? 'تمدید' : 'پلن فعلی') : !stripeConfigured ? 'پرداخت آنلاین فعال نیست' : checkoutTier === plan.tier ? 'در حال انتقال به صفحهٔ پرداخت…' : 'ارتقای پلن'}
                {plan.tier !== currentPlan && stripeConfigured && <ArrowRight className="w-3 h-3 rotate-180" />}
              </button>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-3 font-vazirmatn-light"></p>
        {billingError && (
          <div className="mt-3 bg-surface-2 border border-accent-red/40 rounded-xl p-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-accent-red flex-shrink-0" />
            <p className="text-xs text-white font-vazirmatn-regular">{billingError}</p>
          </div>
        )}
      </div>

      {/* Credits — Persian */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4 font-vazirmatn-bold">کیف پول اعتبار</h3>
        {loadingCredits ? (
          <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : credits ? (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-surface/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-white persian-numbers font-vazirmatn-bold">{toPersianDigits(credits.balance)}</p>
              <p className="text-xs text-slate-400 mt-1 font-vazirmatn-regular">اعتبار موجود</p>
              <p className="text-[10px] text-slate-500 mt-1 font-vazirmatn-light">هر خزش سایت ۵ اعتبار مصرف می‌کند و اگر ناموفق شود، اعتبار برمی‌گردد.</p>
            </div>
            <div className="bg-surface/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-accent-green persian-numbers font-vazirmatn-bold">{toPersianDigits(credits.totalGranted)}</p>
              <p className="text-xs text-slate-400 mt-1 font-vazirmatn-regular">کل اعتبار دریافتی</p>
            </div>
            <div className="bg-surface/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-accent-red persian-numbers font-vazirmatn-bold">{toPersianDigits(credits.totalConsumed)}</p>
              <p className="text-xs text-slate-400 mt-1 font-vazirmatn-regular">کل اعتبار مصرف‌شده</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 text-center py-4 font-vazirmatn-regular">هنوز اعتباری برای این سازمان ثبت نشده است.</p>
        )}
        <p className="text-[11px] text-slate-500 mt-3 font-vazirmatn-light"></p>
      </div>

      {payments.length > 0 && (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3 font-vazirmatn-bold">تاریخچهٔ پرداخت</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-300">
              <thead><tr className="text-slate-500 text-right"><th className="py-2 font-medium">تاریخ</th><th className="font-medium">پلن</th><th className="font-medium">مبلغ</th><th className="font-medium">وضعیت</th><th className="font-medium">کد پیگیری</th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-surface-3/40">
                    <td className="py-2">{formatPersianDate(new Date(p.createdAt))}</td>
                    <td>{getPlanName(p.planId as PlanTier)} ({p.interval === 'year' ? 'سالانه' : 'ماهانه'})</td>
                    <td>{formatMoney(Number(p.amountToman), { currency: 'toman' })}</td>
                    <td>{PAYMENT_STATUS[p.status] || p.status}</td>
                    <td dir="ltr" className="text-right">{p.refId || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Persian currency info */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3 font-vazirmatn-bold">اطلاعات پرداخت فارسی</h3>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="bg-surface/50 rounded-lg p-3">
            <p className="text-slate-400 font-vazirmatn-light">واحد پول پیش‌فرض</p>
            <p className="text-white font-medium mt-1 font-vazirmatn-bold">تومان (۱ تومان = ۱۰ ریال)</p>
            <p className="text-slate-500 mt-1 font-vazirmatn-light">مثال: {formatMoney(50000, { currency: 'toman' })}</p>
          </div>
          <div className="bg-surface/50 rounded-lg p-3">
            <p className="text-slate-400 font-vazirmatn-light">تاریخ صورتحساب</p>
            <p className="text-white font-medium mt-1 font-vazirmatn-bold">{formatPersianDate(new Date(), { format: 'medium' })}</p>
            <p className="text-slate-500 mt-1 font-vazirmatn-light">تاریخ‌ها به تقویم شمسی نمایش داده می‌شوند</p>
          </div>
        </div>
      </div>
    </div>
  );
}
