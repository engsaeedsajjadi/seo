import { useCallback, useEffect, useState } from 'react';
import { Globe2, RefreshCw, Copy, Check, Search } from 'lucide-react';
import { authenticatedFetch } from '../lib/api';
import { formatDateTime } from '../lib/labels';
import { toPersianDigits } from '../lib/persian';

interface ReferringDomains {
  release: string | null;
  active: number;
  lost: number;
  domains: Array<{ domain: string; status: 'active' | 'lost'; firstRelease: string; lastRelease: string }>;
  lastRun: { status: string; result?: any; error?: string | null; createdAt: string; completedAt?: string | null } | null;
}

interface Prospect {
  id: string;
  domain: string;
  status: 'new' | 'to_contact' | 'contacted' | 'won' | 'rejected';
  note: string | null;
  competitorCount: number;
  competitors: string[];
}

const PROSPECT_STATUS: Record<Prospect['status'], string> = {
  new: 'جدید', to_contact: 'برای تماس', contacted: 'تماس گرفته شد', won: 'لینک گرفته شد', rejected: 'رد شد',
};

/** The month range of a release name such as cc-main-2025-26-nov-dec-jan. */
function releaseLabel(release?: string | null): string {
  if (!release) return '—';
  const m = /^cc-main-(\d{4})-\d{2}-([a-z-]+)$/.exec(release);
  return m ? `${m[2].replace(/-/g, ' / ')} ${m[1]}` : release;
}

function emailDraft(domain: string, site: string): string {
  return [
    `سلام، وقت بخیر.`,
    ``,
    `من از ${site} با شما تماس می‌گیرم. مطالب سایت ${domain} را دنبال می‌کنیم و دیدیم در زمینه‌ای که ما هم فعالیم منابعی را معرفی کرده‌اید.`,
    `اگر مناسب بدانید، [نام صفحه یا مقالهٔ مفید شما] می‌تواند برای خوانندگان شما کاربردی باشد: [نشانی صفحه]`,
    ``,
    `اگر همکاری دیگری مثل نوشتن مطلب مهمان یا معرفی متقابل مدنظرتان است، خوشحال می‌شویم.`,
    ``,
    `با احترام،`,
    `[نام شما]`,
  ].join('\n');
}

export default function LinkDiscovery({ projectId, domain }: { projectId: string; domain: string }) {
  const [data, setData] = useState<ReferringDomains | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [tab, setTab] = useState<'domains' | 'prospects'>('domains');
  const [filter, setFilter] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const base = `${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(projectId)}/backlinks`;

  const load = useCallback(async () => {
    const [d, p] = await Promise.all([
      authenticatedFetch(`${base}/referring-domains`, { credentials: 'include' }).then((r) => r.json()).catch(() => null),
      authenticatedFetch(`${base}/prospects`, { credentials: 'include' }).then((r) => r.json()).catch(() => null),
    ]);
    if (d?.success) setData(d.data);
    if (p?.success) setProspects(p.data);
  }, [base]);

  useEffect(() => { void load(); }, [load]);
  const running = data?.lastRun && ['pending', 'running', 'retrying'].includes(data.lastRun.status);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(), 30000);
    return () => clearInterval(timer);
  }, [running, load]);

  async function discover() {
    setBusy(true); setMessage(null);
    try {
      const json = await authenticatedFetch(`${base}/discover`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.json());
      if (json.success) { setMessage({ ok: true, text: 'جست‌وجو شروع شد. این کار برای همهٔ پروژه‌ها و رقبا با هم انجام می‌شود و چند ساعت طول می‌کشد.' }); void load(); }
      else setMessage({ ok: false, text: json.error?.code === 'ALREADY_RUNNING' ? 'جست‌وجوی قبلی هنوز در حال انجام است.' : 'شروع نشد. دوباره تلاش کنید.' });
    } catch { setMessage({ ok: false, text: 'ارتباط با سرور برقرار نشد.' }); }
    setBusy(false);
  }

  async function update(p: Prospect, change: Partial<Pick<Prospect, 'status' | 'note'>>) {
    const json = await authenticatedFetch(`${base}/prospects/${encodeURIComponent(p.id)}`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(change),
    }).then((r) => r.json()).catch(() => null);
    if (json?.success) setProspects((list) => list.map((x) => (x.id === p.id ? { ...x, ...json.data } : x)));
    else setMessage({ ok: false, text: 'ذخیره نشد. دوباره تلاش کنید.' });
  }

  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); } catch { /* selectable */ }
  }

  const shown = (data?.domains ?? []).filter((d) => d.domain.includes(filter.trim().toLowerCase()));
  return (
    <section aria-labelledby="discovery-title" className="bg-surface-2 border border-surface-3/50 rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 id="discovery-title" className="text-sm font-semibold text-white flex items-center gap-2"><Globe2 className="w-4 h-4 text-brand-400" /> دامنه‌های لینک‌دهنده و فرصت‌های لینک‌سازی</h2>
          <p className="text-xs text-slate-400 mt-1">
            از نقشهٔ لینک‌های وب که Common Crawl هر چند ماه منتشر می‌کند: کدام سایت‌ها به {domain} و به رقبا لینک داده‌اند. سایت‌هایی که به رقبا لینک داده‌اند ولی به شما نه، فرصت لینک‌سازی‌اند.
            پوشش این داده از ابزارهای پولی کمتر است و صفحهٔ دقیق لینک را نشان نمی‌دهد.
          </p>
        </div>
        <button type="button" onClick={discover} disabled={busy || !!running} className="px-3 py-2 text-sm rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50 flex items-center gap-2">
          {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {running ? 'در حال جست‌وجو…' : 'جست‌وجوی بک‌لینک‌ها'}
        </button>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-slate-300">
        <span>نسخهٔ داده: <span dir="ltr">{releaseLabel(data?.release)}</span></span>
        <span>دامنهٔ لینک‌دهنده: {toPersianDigits(data?.active ?? 0)}</span>
        {!!data?.lost && <span>از دست رفته: {toPersianDigits(data.lost)}</span>}
        <span>فرصت: {toPersianDigits(prospects.length)}</span>
        {data?.lastRun?.status === 'dead_letter' || data?.lastRun?.status === 'failed'
          ? <span className="text-accent-red">آخرین جست‌وجو ناموفق بود ({formatDateTime(data.lastRun.createdAt)}).</span>
          : data?.lastRun?.completedAt && <span className="text-slate-500">آخرین جست‌وجو: {formatDateTime(data.lastRun.completedAt)}</span>}
      </div>
      {message && <p role="status" className={`text-xs ${message.ok ? 'text-accent-green' : 'text-accent-red'}`}>{message.text}</p>}

      <div role="tablist" className="flex gap-1 bg-surface rounded-lg p-1 w-fit">
        {(['domains', 'prospects'] as const).map((id) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-md text-xs ${tab === id ? 'bg-brand-600 text-white' : 'text-slate-300'}`}>
            {id === 'domains' ? 'لینک‌دهنده‌ها به سایت شما' : 'فرصت‌ها (لینک به رقبا)'}
          </button>
        ))}
      </div>

      {tab === 'domains' ? (
        (data?.domains.length ?? 0) === 0 ? <p className="text-xs text-slate-400">هنوز داده‌ای نیست. «جست‌وجوی بک‌لینک‌ها» را بزنید.</p> : (
          <>
            <label htmlFor="ref-filter" className="sr-only">جست‌وجو در دامنه‌ها</label>
            <input id="ref-filter" dir="ltr" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="example.com"
              className="w-full max-w-xs px-3 py-1.5 bg-surface border border-surface-3/50 rounded-lg text-xs text-white" />
            <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 max-h-96 overflow-y-auto text-xs">
              {shown.slice(0, 1000).map((d) => (
                <li key={d.domain} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded bg-surface">
                  <a href={`https://${d.domain}`} target="_blank" rel="noopener noreferrer" dir="ltr" className="text-slate-200 hover:text-brand-400 truncate">{d.domain}</a>
                  {d.status === 'lost' && <span className="text-[10px] text-accent-yellow">در نسخهٔ آخر دیده نشد</span>}
                </li>
              ))}
            </ul>
          </>
        )
      ) : prospects.length === 0 ? (
        <p className="text-xs text-slate-400">فرصتی نیست. رقبا را در صفحهٔ «رقبا» اضافه کنید و دوباره جست‌وجو کنید.</p>
      ) : (
        <ul className="space-y-2 max-h-[32rem] overflow-y-auto">
          {prospects.slice(0, 300).map((p) => (
            <li key={p.id} className="bg-surface rounded-lg p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <a href={`https://${p.domain}`} target="_blank" rel="noopener noreferrer" dir="ltr" className="text-sm text-white hover:text-brand-400">{p.domain}</a>
                  <p className="text-slate-500 mt-0.5">لینک به {toPersianDigits(p.competitorCount)} رقیب: <span dir="ltr">{p.competitors.join('، ')}</span></p>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor={`ps-${p.id}`} className="sr-only">وضعیت</label>
                  <select id={`ps-${p.id}`} value={p.status} onChange={(e) => update(p, { status: e.target.value as Prospect['status'] })}
                    className="px-2 py-1 bg-surface-2 border border-surface-3/50 rounded text-xs text-white">
                    {Object.entries(PROSPECT_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <button type="button" onClick={() => copy(emailDraft(p.domain, domain), p.id)} className="px-2 py-1 rounded border border-surface-3 text-slate-300 flex items-center gap-1">
                    {copied === p.id ? <Check className="w-3 h-3 text-accent-green" /> : <Copy className="w-3 h-3" />} کپی پیش‌نویس ایمیل
                  </button>
                </div>
              </div>
              <label htmlFor={`pn-${p.id}`} className="sr-only">یادداشت</label>
              <input id={`pn-${p.id}`} defaultValue={p.note ?? ''} maxLength={1000} placeholder="یادداشت (نام مسئول، ایمیل، نتیجهٔ تماس…)"
                onBlur={(e) => { if (e.target.value !== (p.note ?? '')) void update(p, { note: e.target.value }); }}
                className="mt-2 w-full px-2 py-1.5 bg-surface-2 border border-surface-3/50 rounded text-xs text-white placeholder-slate-500" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
