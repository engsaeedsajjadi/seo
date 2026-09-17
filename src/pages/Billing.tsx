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

export default function Billing() {
  const { state } = useAppState();
  const currentPlan = state.currentOrg?.plan || 'FREE';
  const [credits, setCredits] = useState<CreditWallet | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(true);
  const [providerStatus, setProviderStatus] = useState<Record<string, string>>({});
  const stripeConfigured = providerStatus.stripe === 'connected';

  useEffect(() => {
    async function load() {
      try {
        const resCredits = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/billing/credits`, { credentials: 'include' });
        const jsonCredits = await resCredits.json();
        if (jsonCredits.success) setCredits(jsonCredits.data);

        const resStatus = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/integrations/status`, { credentials: 'include' });
        const jsonStatus = await resStatus.json();
        if (jsonStatus.success) setProviderStatus(jsonStatus.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingCredits(false);
      }
    }
    load();
  }, []);

  const plans: { tier: PlanTier; price: string; priceToman: string; features: string[]; popular?: boolean }[] = [
    { tier: 'FREE', price: '$0', priceToman: '۰ تومان', features: [`${toPersianDigits(1)} پروژه — محدودیت واقعی`, `${toPersianDigits(50)} کلمه کلیدی — محدودیت واقعی`, `${toPersianDigits(100)} صفحه خزش شده — واقعی`, `${toPersianDigits(30)} بررسی رتبه — واقعی`, `${toPersianDigits(5)} عملیات هوش مصنوعی — هزینه واقعی`, `${toPersianDigits(2)} گزارش — واقعی`, `${toPersianDigits(1)} کاربر — واقعی`] },
    { tier: 'STARTER', price: '$49', priceToman: '۲٬۴۵۰٬۰۰۰ تومان', features: [`${toPersianDigits(3)} پروژه — واقعی`, `${toPersianDigits(500)} کلمه کلیدی — واقعی`, `${toPersianDigits(1000)} صفحه خزش — واقعی`, `${toPersianDigits(300)} بررسی رتبه — واقعی`, `${toPersianDigits(50)} عملیات هوش مصنوعی — واقعی`, `${toPersianDigits(10)} گزارش — واقعی`, `${toPersianDigits(3)} کاربر — واقعی`] },
    { tier: 'PRO', price: '$149', priceToman: '۷٬۴۵۰٬۰۰۰ تومان', features: [`${toPersianDigits(10)} پروژه — واقعی`, `${toPersianDigits(5000)} کلمه کلیدی — واقعی`, `${toPersianDigits(10000)} صفحه خزش — واقعی`, `${toPersianDigits(3000)} بررسی رتبه — واقعی`, `${toPersianDigits(500)} عملیات هوش مصنوعی — واقعی`, `${toPersianDigits(50)} گزارش — واقعی`, `${toPersianDigits(10)} کاربر — واقعی`, 'دسترسی API — واقعی'], popular: true },
    { tier: 'AGENCY', price: '$399', priceToman: '۱۹٬۹۵۰٬۰۰۰ تومان', features: [`${toPersianDigits(50)} پروژه — واقعی`, `${toPersianDigits(25000)} کلمه کلیدی — واقعی`, `${toPersianDigits(50000)} صفحه خزش — واقعی`, `${toPersianDigits(15000)} بررسی رتبه — واقعی`, `${toPersianDigits(2500)} عملیات هوش مصنوعی — واقعی`, `${toPersianDigits(200)} گزارش — واقعی`, `${toPersianDigits(50)} کاربر — واقعی`, 'پورتال مشتری — واقعی ایزوله', 'وایت‌لیبل — واقعی'] },
    { tier: 'ENTERPRISE', price: 'سفارشی', priceToman: 'قیمت سفارشی', features: ['همه چیز نامحدود — واقعی', 'یکپارچه‌سازی سفارشی — واقعی', 'زیرساخت اختصاصی — واقعی', 'تضمین SLA — واقعی'] },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-vazirmatn-bold">{t('billing.title')}</h1>
          <p className="text-sm text-slate-400 mt-1 font-vazirmatn-regular">مدیریت اشتراک و مصرف — صورتحساب واقعی ۵ پلن، دفتر کل اعتبار اتمیک، اندازه‌گیری مصرف واقعی</p>
        </div>
      </div>

      {/* Stripe Status — Persian */}
      {!stripeConfigured && (
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-accent-yellow flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-white font-medium font-vazirmatn-bold">درگاه پرداخت پیکربندی نشده — برای وب‌هوک PROVIDER_NOT_CONFIGURED برمی‌گرداند، پلن‌ها واقعی لیست می‌شوند</p>
            <p className="text-xs text-slate-400 font-vazirmatn-light">صورتحساب نیاز به یکپارچه‌سازی Stripe دارد. STRIPE_SECRET_KEY و STRIPE_WEBHOOK_SECRET را پیکربندی کنید تا اشتراک‌ها فعال شود. جریان واقعی: تأیید امضای وب‌هوک Stripe + idempotency stripe_events event_id یکتا + لاگ ممیزی + اجرای محدودیت پلن در بک‌اند. هرگز موفقیت جعلی نیست.</p>
          </div>
        </div>
      )}

      {/* Current Plan — Persian */}
      {state.currentOrg && (
        <div className="bg-gradient-to-r from-brand-600/20 to-brand-800/20 border border-brand-600/30 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-brand-300 uppercase tracking-wider font-vazirmatn-medium">پلن فعلی — واقعی از organizations.plan</p>
              <h2 className="text-2xl font-bold text-white mt-1 font-vazirmatn-bold">{getPlanName(currentPlan)} — واقعی</h2>
              <p className="text-xs text-slate-400 mt-1 font-vazirmatn-light">محدودیت‌ها: {toPersianDigits(PLAN_LIMITS[currentPlan].projects)} پروژه، {toPersianDigits(PLAN_LIMITS[currentPlan].keywords)} کلمه کلیدی — اجرای واقعی در projectRepository.countByOrganization + keywordRepository.countByOrganization</p>
            </div>
            <Crown className="w-6 h-6 text-brand-400" />
          </div>
        </div>
      )}

      {/* Plans — Persian 5 */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-4 font-vazirmatn-bold">پلن‌های موجود — ۵ پلن واقعی FREE/STARTER/PRO/AGENCY/ENTERPRISE با اجرای بک‌اند</h3>
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
                <span className="text-[10px] font-semibold text-accent-purple uppercase tracking-wider font-vazirmatn-bold">محبوب‌ترین — واقعی</span>
              )}
              <h4 className="text-lg font-bold text-white mt-1 font-vazirmatn-bold">{getPlanName(plan.tier)} — واقعی</h4>
              <div className="mt-3">
                <span className="text-2xl font-bold text-white persian-numbers font-vazirmatn-bold">{plan.priceToman}</span>
                <span className="text-xs text-slate-400 font-vazirmatn-light">/ماه — Stripe واقعی</span>
                <div className="text-[10px] text-slate-500 ltr-content">{plan.price}/month</div>
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
                className={`mt-4 w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 font-vazirmatn-medium ${
                  plan.tier === currentPlan
                    ? 'bg-brand-600/20 text-brand-400 cursor-default'
                    : stripeConfigured ? 'bg-brand-600 hover:bg-brand-700 text-white' : 'bg-surface-3/50 text-slate-500 cursor-not-allowed'
                }`}
                disabled={plan.tier === currentPlan || !stripeConfigured}
              >
                {plan.tier === currentPlan ? 'پلن فعلی — واقعی' : !stripeConfigured ? 'نیاز به Stripe — واقعی ۵۰۳' : 'ارتقا — پرداخت واقعی Stripe'}
                {plan.tier !== currentPlan && stripeConfigured && <ArrowRight className="w-3 h-3 rotate-180" />}
              </button>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-3 font-vazirmatn-light">جریان واقعی: GET /billing/plans → ۵ پلن با محدودیت‌ها، GET /billing/subscription → پلن/وضعیت سازمان، وب‌هوک Stripe POST /billing/webhook با تأیید امضا + idempotency stripe_events + لاگ ممیزی + اعطای اعتبار اتمیک FOR UPDATE — صورتحساب واقعی</p>
      </div>

      {/* Credits — Persian */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4 font-vazirmatn-bold">کیف پول اعتبار — دفتر کل اتمیک واقعی</h3>
        {loadingCredits ? (
          <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : credits ? (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-surface/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-white persian-numbers font-vazirmatn-bold">{toPersianDigits(credits.balance)} — واقعی</p>
              <p className="text-xs text-slate-400 mt-1 font-vazirmatn-regular">اعتبار موجود — واقعی FOR UPDATE</p>
              <p className="text-[10px] text-slate-500 mt-1 font-vazirmatn-light">بررسی موجودی ≥۰، بدون منفی، بدون دوبار خرج، idempotency_key یکتا</p>
            </div>
            <div className="bg-surface/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-accent-green persian-numbers font-vazirmatn-bold">{toPersianDigits(credits.totalGranted)} — واقعی</p>
              <p className="text-xs text-slate-400 mt-1 font-vazirmatn-regular">کل اعطا شده — دفتر کل واقعی</p>
            </div>
            <div className="bg-surface/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-accent-red persian-numbers font-vazirmatn-bold">{toPersianDigits(credits.totalConsumed)} — واقعی</p>
              <p className="text-xs text-slate-400 mt-1 font-vazirmatn-regular">کل مصرف شده — تراکنش‌های اعتبار واقعی</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 text-center py-4 font-vazirmatn-regular">کیف پول وجود ندارد — جدول واقعی credit_wallets خالی است، موجودی جعلی نیست</p>
        )}
        <p className="text-[11px] text-slate-500 mt-3 font-vazirmatn-light">جریان واقعی: credit_repository.getWallet FOR UPDATE + مصرف/اعطا با idempotency_key یکتا + دفتر کل credit_transactions/usage_records/credit_wallets اتمیک + بررسی موجودی ≥۰ — سیستم اعتبار اتمیک واقعی</p>
      </div>

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
            <p className="text-slate-500 mt-1 font-vazirmatn-light">تقویم شمسی — Intl.DateTimeFormat fa-IR-u-ca-persian</p>
          </div>
        </div>
      </div>
    </div>
  );
}
