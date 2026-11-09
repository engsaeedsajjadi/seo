import { useState, useEffect } from 'react';
import {
  Search, Plus, Download, ArrowUpDown, AlertCircle, ExternalLink, RefreshCw
} from 'lucide-react';
import { useAppState, formatNumber } from '../lib/store';
import { api, authenticatedFetch } from '../lib/api';
import { downloadCsv } from '../lib/csv';
import type { Keyword } from '../lib/types';
import { t } from '../i18n';
import { COUNTRY_LABELS, LANGUAGE_LABELS } from '../lib/labels';
import { toPersianDigits, formatPersianDate, formatPersianNumber, formatCurrency, formatRelativePersianTime } from '../lib/persian';

// Country/language options — same canonical lists as the project form.
const COUNTRIES = [
  { code: 'IR', label: 'ایران' },
  { code: 'US', label: 'آمریکا' },
  { code: 'GB', label: 'انگلستان' },
  { code: 'DE', label: 'آلمان' },
  { code: 'FR', label: 'فرانسه' },
  { code: 'TR', label: 'ترکیه' },
  { code: 'AE', label: 'امارات' },
];

const LANGUAGES = [
  { code: 'fa', label: 'فارسی' },
  { code: 'en', label: 'انگلیسی' },
  { code: 'ar', label: 'عربی' },
  { code: 'tr', label: 'ترکی' },
];

/** The API returns the new field names; fall back to legacy aliases if ever present. */
export function keywordTerm(k: Keyword): string {
  return k.keyword ?? k.term ?? '';
}

export function keywordVolume(k: Keyword): number | null {
  return k.searchVolume ?? k.volume ?? null;
}

export default function Keywords() {
  const { state } = useAppState();
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [intentFilter, setIntentFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [sortBy, setSortBy] = useState<'position' | 'volume' | 'difficulty'>('position');
  const [seedInput, setSeedInput] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  // Country/language for new keywords — prefilled from the project's own
  // settings (this is also what rank checks and provider data actually use).
  const [addCountry, setAddCountry] = useState('IR');
  const [addLanguage, setAddLanguage] = useState('fa');

  const hasProject = state.currentProject !== null;

  function exportKeywords() {
    downloadCsv(`keywords-${state.currentProject?.domain}.csv`, ['کلمهٔ کلیدی', 'حجم جست‌وجو', 'CPC', 'سختی', 'رتبه'],
      keywords.map((k: any) => [k.keyword ?? k.term, k.searchVolume ?? k.volume, k.cpc, k.difficulty, k.currentPosition]));
  }

  useEffect(() => {
    async function loadKeywords() {
      if (!state.currentProject) {
        setLoading(false);
        return;
      }

      try {
        const result = await api.getKeywords(state.currentProject.id);
        if (result.success) setKeywords(result.data);
      } catch (error) {
        console.error('Failed to load keywords:', error);
      } finally {
        setLoading(false);
      }
    }

    loadKeywords();

    // Prefill the modal's country/language from the current project.
    const proj = state.currentProject;
    if (proj?.country && COUNTRIES.some(c => c.code === String(proj.country).toUpperCase())) {
      setAddCountry(String(proj.country).toUpperCase());
    }
    if (proj?.language && LANGUAGES.some(l => l.code === String(proj.language).toLowerCase())) {
      setAddLanguage(String(proj.language).toLowerCase());
    }
  }, [state.currentProject]);

  async function handleAddKeywords() {
    if (!state.currentProject) return;
    const terms = seedInput.split('\n').map(s => s.trim()).filter(Boolean);
    if (terms.length === 0) {
      setAddError('دست‌کم یک کلمهٔ کلیدی وارد کنید.');
      return;
    }
    setAddLoading(true);
    setAddError(null);
    setAddSuccess(null);
    try {
      const result = await api.addKeywords(state.currentProject.id, terms, {
        country: addCountry,
        language: addLanguage,
      });
      if (result.success) {
        setKeywords(prev => [...prev, ...result.data]);
        setAddSuccess(`${result.data.length} کلمهٔ کلیدی اضافه شد`);
        setSeedInput('');
        setShowAddModal(false);
      } else {
        setAddError(result.error.message);
      }
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddLoading(false);
    }
  }

  if (!hasProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center" dir="rtl">
        <Search className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">پروژه‌ای انتخاب نشده</h2>
        <p className="text-slate-400">برای مدیریت کلمات کلیدی یک پروژه انتخاب یا ایجاد کنید.</p>
      </div>
    );
  }

  const filteredKeywords = keywords
    .filter(k => keywordTerm(k).toLowerCase().includes(searchQuery.toLowerCase()))
    .filter(k => intentFilter === 'all' || k.intent === intentFilter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">در حال بارگذاری کلمات کلیدی…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">کلمات کلیدی</h1>
          <p className="text-sm text-slate-400 mt-1">
            عبارت‌هایی که می‌خواهید با آن‌ها در گوگل دیده شوید — سایت <span className="text-brand-400">{state.currentProject?.domain}</span> 
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={exportKeywords} disabled={keywords.length === 0} className="px-4 py-2 bg-surface-3/50 hover:bg-surface-3 text-slate-300 text-sm font-medium rounded-lg flex items-center gap-2">
            <Download className="w-4 h-4" />
            خروجی
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            افزودن کلمات کلیدی
          </button>
        </div>
      </div>

      <KeywordResearch
        projectId={state.currentProject!.id}
        onAdded={(added) => { setKeywords((prev) => [...prev, ...added]); setAddSuccess(`${toPersianDigits(added.length)} کلمهٔ کلیدی اضافه شد. حجم جست‌وجو و رتبه بعد از اولین بررسی رتبه نمایش داده می‌شود.`); }}
        country={addCountry}
        language={addLanguage}
      />

      {addSuccess && (
        <div className="bg-accent-green/20 border border-accent-green/30 rounded-xl p-4 text-sm text-accent-green">
          {addSuccess}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="جستجوی کلمات کلیدی..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-surface-2 border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50"
          />
        </div>
        <select
          value={intentFilter}
          onChange={e => setIntentFilter(e.target.value)}
          className="px-3 py-2 bg-surface-2 border border-surface-3/50 rounded-lg text-xs text-white focus:outline-none"
        >
          <option value="all">همهٔ هدف‌ها</option>
          <option value="informational">دنبال اطلاعات</option>
          <option value="navigational">دنبال یک سایت مشخص</option>
          <option value="commercial">مقایسه پیش از خرید</option>
          <option value="transactional">آمادهٔ خرید</option>
        </select>
        <button
          onClick={() => setSortBy(sortBy === 'position' ? 'volume' : sortBy === 'volume' ? 'difficulty' : 'position')}
          className="px-3 py-2 bg-surface-2 border border-surface-3/50 rounded-lg text-xs text-slate-300 flex items-center gap-1"
        >
          <ArrowUpDown className="w-3 h-3" />
          مرتب‌سازی: {{position:'رتبه',volume:'حجم جست‌وجو',difficulty:'سختی'}[sortBy]}
        </button>
      </div>

      {/* Keywords Table */}
      {filteredKeywords.length === 0 ? (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-12 text-center">
          <Search className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">هنوز کلمهٔ کلیدی‌ای ندارید</h3>
          <p className="text-sm text-slate-400 mb-4">برای پیگیری عملکرد، کلمات کلیدی را اضافه کنید. کشور و زبان از تنظیمات پروژه گرفته می‌شوند.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            افزودن کلمات کلیدی
          </button>
        </div>
      ) : (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-surface-3/50">
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">کلمهٔ کلیدی</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">هدف</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">حجم جست‌وجو</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">CPC</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">سختی / رقابت</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">رتبه</th>
              </tr>
            </thead>
            <tbody>
              {filteredKeywords.map((keyword) => (
                <tr key={keyword.id} className="border-b border-surface-3/20 hover:bg-surface-3/20">
                  <td className="px-4 py-3">
                    <span className="text-sm text-white font-medium">{keywordTerm(keyword)}</span>
                    <span className="block text-[10px] text-slate-500 ltr-content">{COUNTRY_LABELS[keyword.country] || keyword.country} · {LANGUAGE_LABELS[keyword.language] || keyword.language}</span>
                  </td>
                  <td className="px-4 py-3">
                    {keyword.intent && <IntentBadge intent={keyword.intent} />}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-300">
                    {(() => { const v = keywordVolume(keyword); return v !== null ? formatNumber(v) : '—'; })()}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-300">
                    {keyword.cpc !== null ? `$${keyword.cpc.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {keyword.difficulty !== null ? <DifficultyBadge kd={keyword.difficulty} /> : competitionLabel((keyword as { competition?: number | null }).competition)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-white">
                    {keyword.currentPosition != null ? toPersianDigits(keyword.currentPosition) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {/* Add Keywords Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-surface-2 border border-surface-3/50 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">افزودن کلمات کلیدی</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">کلمات کلیدی (هر کدام در یک خط)</label>
                <textarea
                  rows={5}
                  value={seedInput}
                  onChange={e => setSeedInput(e.target.value)}
                  placeholder="بلیط هواپیما&#10;رزرو هتل&#10;آموزش سئو"
                  className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">کشور</label>
                  <select
                    value={addCountry}
                    onChange={e => setAddCountry(e.target.value)}
                    aria-label="کشور"
                    className="w-full mt-1 px-3 py-2 bg-surface border border-surface-3/50 rounded-lg text-sm text-white"
                  >
                    {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400">زبان</label>
                  <select
                    value={addLanguage}
                    onChange={e => setAddLanguage(e.target.value)}
                    aria-label="زبان"
                    className="w-full mt-1 px-3 py-2 bg-surface border border-surface-3/50 rounded-lg text-sm text-white"
                  >
                    {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                  </select>
                </div>
              </div>
              {addError && <p className="text-xs text-accent-red">{addError}</p>}
              <p className="text-[11px] text-slate-500">کشور و زبان به‌صورت پیش‌فرض از تنظیمات خود پروژه می‌آیند — همین‌ها برای بررسی رتبه در گوگل استفاده می‌شوند.</p>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)} disabled={addLoading} className="px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-50">انصراف</button>
              <button onClick={handleAddKeywords} disabled={addLoading} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-50">
                {addLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                {addLoading ? 'در حال افزودن…' : 'افزودن'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IntentBadge({ intent }: { intent: string }) {
  const colors: Record<string, string> = {
    informational: 'bg-blue-500/20 text-blue-400',
    navigational: 'bg-purple-500/20 text-purple-400',
    commercial: 'bg-orange-500/20 text-orange-400',
    transactional: 'bg-green-500/20 text-green-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${colors[intent] || 'bg-slate-500/20 text-slate-400'}`}>
      {intent}
    </span>
  );
}

function DifficultyBadge({ kd }: { kd: number }) {
  const color = kd >= 70 ? 'text-red-400' : kd >= 40 ? 'text-yellow-400' : 'text-green-400';
  return <span className={`text-sm font-medium ${color}`}>{kd}</span>;
}

/** Keyword Planner competition, stored as 0–1 (see the worker's KWRank sync). */
function competitionLabel(value?: number | null) {
  if (value === null || value === undefined) return '—';
  const v = Number(value);
  const [label, tone] = v < 0.34 ? ['رقابت کم', 'text-accent-green'] : v < 0.67 ? ['رقابت متوسط', 'text-accent-yellow'] : ['رقابت زیاد', 'text-accent-red'];
  return <span className={`text-xs ${tone}`}>{label}</span>;
}

const RESEARCH_ERRORS: Record<string, string> = {
  PROVIDER_NOT_CONFIGURED: 'سرویس تحقیق کلمهٔ کلیدی (KWRank) تنظیم نشده است.',
  PROVIDER_ACCOUNT: 'حساب KWRank کلمه را نپذیرفت. اعتبار یا اشتراک حساب KWRank را بررسی کنید.',
  PROVIDER_ERROR: 'سرویس KWRank جواب نداد. چند دقیقه دیگر دوباره تلاش کنید.',
  RATE_LIMITED: 'در یک ساعت گذشته جست‌وجوی زیادی انجام شده است. کمی بعد دوباره تلاش کنید.',
  VALIDATION_ERROR: 'کلمه باید بین ۲ تا ۱۰۰ حرف باشد.',
};

/** Related searches from KWRank; chosen ones are added to the project and tracked from then on. */
function KeywordResearch({ projectId, onAdded, country, language }: {
  projectId: string; onAdded: (added: Keyword[]) => void; country: string; language: string;
}) {
  const [seed, setSeed] = useState('');
  const [results, setResults] = useState<Array<{ keyword: string; tracked: boolean }> | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (seed.trim().length < 2) return;
    setBusy(true); setError(null); setResults(null); setChosen(new Set());
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(projectId)}/keywords/research`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keyword: seed.trim() }),
      });
      const json = await res.json();
      if (json.success) setResults(json.data.suggestions);
      else setError(RESEARCH_ERRORS[json.error?.code] ?? 'جست‌وجو انجام نشد. دوباره تلاش کنید.');
    } catch {
      setError('ارتباط با سرور برقرار نشد.');
    } finally {
      setBusy(false);
    }
  }
  async function add() {
    if (chosen.size === 0) return;
    setBusy(true); setError(null);
    const result = await api.addKeywords(projectId, [...chosen], { country, language });
    setBusy(false);
    if (result.success) {
      onAdded(result.data);
      setResults((r) => r?.map((x) => (chosen.has(x.keyword) ? { ...x, tracked: true } : x)) ?? null);
      setChosen(new Set());
    } else {
      setError(result.error.code === 'LIMIT_REACHED' ? 'سقف کلمات کلیدی پر شده است.' : 'افزودن انجام نشد. دوباره تلاش کنید.');
    }
  }
  const toggle = (k: string) => setChosen((c) => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <section aria-labelledby="research-title" className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
      <h2 id="research-title" className="text-sm font-semibold text-white">پیدا کردن کلمات کلیدی جدید</h2>
      <p className="text-xs text-slate-400 mt-1">یک کلمهٔ پایه بنویسید تا جست‌وجوهای مرتبطی که کاربران در گوگل انجام می‌دهند پیدا شود. کلمه‌های انتخاب‌شده به پروژه اضافه می‌شوند و حجم جست‌وجوی ماهانه، میزان رقابت و رتبه‌شان بعد از اولین بررسی رتبه می‌آید.</p>
      <form onSubmit={search} className="mt-3 flex flex-wrap gap-2">
        <label htmlFor="research-seed" className="sr-only">کلمهٔ پایه</label>
        <input id="research-seed" value={seed} onChange={(e) => setSeed(e.target.value)} minLength={2} maxLength={100} placeholder="مثلاً بازسازی آشپزخانه"
          className="flex-1 min-w-[200px] px-3 py-2 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50" />
        <button type="submit" disabled={busy || seed.trim().length < 2} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg disabled:opacity-50 flex items-center gap-2">
          {busy && !results ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} جست‌وجو
        </button>
      </form>
      {error && <p role="alert" className="mt-3 text-xs text-accent-red">{error}</p>}
      {results && (results.length === 0 ? <p className="mt-3 text-xs text-slate-400">پیشنهادی پیدا نشد. کلمهٔ کلی‌تری امتحان کنید.</p> : (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <p className="text-xs text-slate-400">{toPersianDigits(results.length)} پیشنهاد · {toPersianDigits(chosen.size)} انتخاب‌شده</p>
            <button type="button" onClick={add} disabled={busy || chosen.size === 0} className="px-3 py-1.5 bg-accent-green/90 hover:bg-accent-green text-white text-xs rounded-lg disabled:opacity-40 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> افزودن به پروژه
            </button>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 max-h-80 overflow-y-auto">
            {results.map((r) => (
              <li key={r.keyword}>
                <label className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${r.tracked ? 'text-slate-500' : 'text-slate-200 hover:bg-surface-3/40 cursor-pointer'}`}>
                  <input type="checkbox" disabled={r.tracked} checked={r.tracked || chosen.has(r.keyword)} onChange={() => toggle(r.keyword)} />
                  <span className="flex-1">{r.keyword}</span>
                  {r.tracked && <span className="text-[10px] text-slate-500">در پروژه</span>}
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
