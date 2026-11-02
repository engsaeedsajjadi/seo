import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Building2, Coins, Search, ShieldAlert, Users } from 'lucide-react';
import { api, type PlatformOrganization, type PlatformOverview } from '../lib/api';
import { formatPersianNumber, toPersianDigits } from '../lib/persian';

const PLANS = ['FREE', 'STARTER', 'PRO', 'AGENCY', 'ENTERPRISE'];
const usd = (cents: number | string) => `$${formatPersianNumber(Math.round(Number(cents) / 100))}`;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

export default function Platform() {
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [orgs, setOrgs] = useState<PlatformOrganization[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [denied, setDenied] = useState(false);

  const load = useCallback(async (term = '') => {
    const [o, list] = await Promise.all([api.getPlatformOverview(), api.getPlatformOrganizations(term)]);
    if (!o.success) { setDenied(true); return; }
    setOverview(o.data);
    if (list.success) setOrgs(list.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function apply(label: string, action: Promise<{ success: boolean; error?: { message: string } }>) {
    setError(''); setNotice('');
    const result = await action;
    if (result.success) { setNotice(label); await load(search); }
    else setError(result.error?.message || 'انجام نشد');
  }
  function grant(org: PlatformOrganization) {
    const raw = window.prompt(`چند اعتبار به «${org.name}» اضافه شود؟`);
    const amount = Number(raw);
    if (!raw || !Number.isInteger(amount) || amount < 1) return;
    apply('اعتبار اضافه شد.', api.grantPlatformCredits(org.id, amount, 'اعطا توسط مدیر پلتفرم', crypto.randomUUID()));
  }
  function submitSearch(event: FormEvent) { event.preventDefault(); load(search.trim()); }

  if (denied) return <p className="text-slate-400">این بخش در دسترس نیست.</p>;
  if (!overview) return <p role="status" className="text-slate-400">در حال بارگذاری…</p>;
  const mrr = overview.plans.reduce((sum, p) => sum + p.organizations * p.price_monthly_cents, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">مدیریت پلتفرم</h1>
        <p className="text-sm text-slate-400 mt-1">مشتریان، درآمد و مصرف کل سامانه</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="سازمان‌ها" value={formatPersianNumber(overview.organizations)} hint={`${formatPersianNumber(overview.suspended)} معلق`} />
        <Stat label="کاربران" value={formatPersianNumber(overview.users)} hint={`${formatPersianNumber(overview.new_users_30d)} جدید در ۳۰ روز`} />
        <Stat label="درآمد این ماه" value={usd(overview.revenue_cents_month)} hint={`کل: ${usd(overview.revenue_cents_total)}`} />
        <Stat label="درآمد ماهانهٔ برآوردی" value={usd(mrr)} hint="بر اساس پلن فعلی سازمان‌ها" />
        <Stat label="اعتبار مصرف‌شدهٔ این ماه" value={formatPersianNumber(Number(overview.credits_consumed_month))} />
        <Stat label="هزینهٔ AI این ماه" value={`$${toPersianDigits(Number(overview.ai_cost_usd_month).toFixed(2))}`} />
        <Stat label="پروژه‌ها" value={formatPersianNumber(overview.projects)} />
        <Stat label="کارهای ناموفق ۲۴ ساعت" value={formatPersianNumber(overview.jobsLast24h.dead_letter || 0)} hint={`${formatPersianNumber(overview.jobsLast24h.completed || 0)} موفق`} />
      </div>

      <form onSubmit={submitSearch} className="flex gap-2">
        <input aria-label="جست‌وجوی مشتری" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="نام سازمان یا ایمیل مالک" className="flex-1 px-3 py-2 rounded-lg bg-surface-2 border border-surface-3/50 text-sm text-white" />
        <button className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg flex items-center gap-2"><Search className="w-4 h-4" /> جست‌وجو</button>
      </form>

      {error && <p role="alert" className="text-sm text-accent-red">{error}</p>}
      {notice && <p role="status" className="text-sm text-accent-green">{notice}</p>}

      <div className="space-y-3">
        {orgs.length === 0 && <p className="text-sm text-slate-400">سازمانی پیدا نشد.</p>}
        {orgs.map((org) => (
          <div key={org.id} className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white font-medium flex items-center gap-2"><Building2 className="w-4 h-4 text-slate-400" /> {org.name}
                  {org.suspendedAt && <span className="text-[11px] px-2 py-0.5 rounded bg-accent-red/20 text-accent-red">معلق</span>}
                </p>
                <p className="text-xs text-slate-400 mt-1 break-all" dir="ltr">{org.ownerEmail}</p>
                <p className="text-xs text-slate-500 mt-2 flex flex-wrap gap-3">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {formatPersianNumber(org.members)} عضو</span>
                  <span>{formatPersianNumber(org.projects)} پروژه</span>
                  <span className="flex items-center gap-1"><Coins className="w-3 h-3" /> {formatPersianNumber(org.balance)} اعتبار</span>
                  <span>درآمد: {usd(org.revenueCents)}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label={`پلن ${org.name}`} value={org.plan} onChange={(e) => apply('پلن تغییر کرد.', api.updatePlatformOrganization(org.id, { plan: e.target.value }))} className="px-2 py-1.5 rounded bg-surface-3/40 text-xs text-white">
                  {PLANS.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
                </select>
                <button onClick={() => grant(org)} className="px-3 py-1.5 rounded bg-surface-3/40 text-xs text-slate-200 hover:bg-surface-3">افزودن اعتبار</button>
                <button onClick={() => apply(org.suspendedAt ? 'تعلیق برداشته شد.' : 'سازمان معلق شد.', api.updatePlatformOrganization(org.id, { suspended: !org.suspendedAt }))} className="px-3 py-1.5 rounded bg-accent-red/20 text-xs text-accent-red flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" /> {org.suspendedAt ? 'رفع تعلیق' : 'تعلیق'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
