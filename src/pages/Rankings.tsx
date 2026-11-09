import { useState, useEffect } from 'react';
import {
  BarChart3, Calendar, Monitor, Smartphone, AlertCircle, RefreshCw
} from 'lucide-react';
import { useAppState } from '../lib/store';
import CsvImport from '../components/CsvImport';
import { toRankRows } from '../lib/csv-parse';
import { api } from '../lib/api';
import type { RankingEntry } from '../lib/types';
import { t } from '../i18n';
import { Link } from 'react-router-dom';
import { apiMessage, formatDateOnly } from '../lib/labels';
import { toPersianDigits, formatPersianDate, formatPersianNumber, formatCurrency, formatRelativePersianTime } from '../lib/persian';

export default function Rankings() {
  const { state } = useAppState();
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [importRevision, setImportRevision] = useState(0);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  const hasProject = state.currentProject !== null;

  useEffect(() => {
    async function loadRankings() {
      if (!state.currentProject) {
        setLoading(false);
        return;
      }

      try {
        const result = await api.getRankings(state.currentProject.id);
        if (result.success) {
          setRankings(result.data);
        } else {
            console.error('Failed to load rankings:', result.error);
        }
      } catch (error) {
        console.error('Failed to load rankings:', error);
      } finally {
        setLoading(false);
      }
    }

    loadRankings();
  }, [state.currentProject, importRevision]);

  // A live rank service (DataForSEO or a SerpApi-format service) gives the exact Google position.
  const liveRank = state.providerStatus.dataForSeo === 'connected' || state.providerStatus.serpapi === 'connected' || state.providerStatus.kwrank === 'connected';
  const rankSourceReady = liveRank || state.providerStatus.googleSearchConsole === 'connected';

  async function handleCheckNow() {
    if (!state.currentProject) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const result = liveRank
        ? await api.checkRankings(state.currentProject.id)
        : await api.syncGoogleProperty(state.currentProject.id, 'gsc');
      if (result.success) {
        setCheckResult(`بررسی رتبه در صف قرار گرفت. نتیجه به‌زودی نمایش داده می‌شود.`);
        // The check runs in the background; reload a few times while it works.
        for (const delay of [5000, 15000, 30000, 60000]) setTimeout(() => setImportRevision((r) => r + 1), delay);
      } else {
        if (result.error.code === 'PROVIDER_NOT_CONFIGURED') {
          setCheckResult(`سرویس بررسی رتبه هنوز فعال نشده است.`);
        } else {
          setCheckResult(apiMessage(result.error.message));
        }
      }
    } catch (e) {
      setCheckResult(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  }

  if (!hasProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center" dir="rtl">
        <BarChart3 className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">پروژه‌ای انتخاب نشده</h2>
        <p className="text-slate-400">برای پیگیری رتبه‌ها یک پروژه انتخاب یا ایجاد کنید.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">در حال بارگذاری رتبه‌ها…</p>
        </div>
      </div>
    );
  }

  // Group rankings by keyword for display
  const keywordRankings = rankings.reduce((acc, r) => {
    if (!acc[r.keyword]) acc[r.keyword] = [];
    acc[r.keyword].push(r);
    return acc;
  }, {} as Record<string, RankingEntry[]>);

  const latestRankings = Object.entries(keywordRankings).map(([keyword, entries]) => {
    const sorted = entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latest = sorted[0];
    const previous = sorted[1];
    return {
      keyword,
      position: latest.position,
      change: latest.position && previous?.position ? previous.position - latest.position : null,
      url: latest.url,
      // Best position seen; null when the site was never found within the checked depth.
      best: entries.some(e => e.position) ? Math.min(...entries.filter(e => e.position).map(e => e.position as number)) : null,
    };
  });

  const importPanel = state.currentProject && (
    <CsvImport
      title="ورود رتبه از فایل"
      help="در سرچ کنسول از بخش Performance خروجی CSV بگیرید و فایل Queries را اینجا بدهید. عدد سرچ کنسول میانگین موقعیت است، نه رتبهٔ دقیق همان روز."
      endpoint={`/api/v1/projects/${state.currentProject.id}/rankings/import`}
      toRows={toRankRows}
      onImported={() => setImportRevision((n) => n + 1)}
      summary={(d) => `${formatPersianNumber(d.matched + d.created)} کلمه ثبت شد (${formatPersianNumber(d.created)} کلمهٔ جدید).${d.skipped ? ` ${formatPersianNumber(d.skipped)} کلمه به دلیل سقف پلن ثبت نشد.` : ''}`}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">رتبه در گوگل</h1>
          <p className="text-sm text-slate-400 mt-1">
            جایگاه کلمات کلیدی شما در نتایج گوگل — سایت <span className="text-brand-400">{state.currentProject?.domain}</span> 
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-surface-2 border border-surface-3/50 rounded-lg overflow-hidden">
            <button
              onClick={() => setDevice('desktop')}
              className={`px-3 py-1.5 text-xs flex items-center gap-1 ${device === 'desktop' ? 'bg-brand-600/20 text-brand-400' : 'text-slate-400 hover:text-white'}`}
            >
              <Monitor className="w-3 h-3" /> دسکتاپ
            </button>
            <button
              onClick={() => setDevice('mobile')}
              className={`px-3 py-1.5 text-xs flex items-center gap-1 ${device === 'mobile' ? 'bg-brand-600/20 text-brand-400' : 'text-slate-400 hover:text-white'}`}
            >
              <Smartphone className="w-3 h-3" /> موبایل
            </button>
          </div>
          {rankSourceReady && <button onClick={handleCheckNow} disabled={checking} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-50">
            {checking ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
            {checking ? 'در حال ثبت در صف…' : 'بررسی رتبه'}
          </button>}
        </div>
      </div>

      {state.providerStatus.kwrank === 'connected' && state.providerStatus.dataForSeo !== 'connected' && state.providerStatus.serpapi !== 'connected' && (
        <p className="text-xs text-slate-400">
          رتبه‌ها از KWRank خوانده می‌شود. کلمهٔ کلیدی تازه به‌طور خودکار در KWRank ثبت می‌شود و رتبه‌اش بعد از اولین بررسی KWRank اینجا نمایش داده می‌شود.
        </p>
      )}

      {checkResult && (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4 text-sm text-slate-300">
          {checkResult}
        </div>
      )}

      {rankings.length === 0 ? (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-12 text-center">
          <BarChart3 className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">هنوز رتبه‌ای ثبت نشده است</h3>
          <p className="text-sm text-slate-400 mb-4 max-w-lg mx-auto">{rankSourceReady ? 'اول در صفحهٔ «کلمات کلیدی» چند کلمه اضافه کنید، بعد «بررسی رتبه» را بزنید.' : 'برای دیدن رتبه‌ها یکی از این سه راه لازم است: مدیر برنامه سرویس رتبه (KWRank) را فعال کند، سرچ کنسول گوگل را وصل کنید، یا خروجی CSV سرچ کنسول را از کادر پایین صفحه وارد کنید.'}</p>
          {rankSourceReady ? <button onClick={handleCheckNow} disabled={checking} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
            {checking ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
            بررسی رتبه
          </button> : <Link to="/integrations" className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2">اتصال سرچ کنسول</Link>}
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
              <p className="text-xs text-slate-400">۳ رتبهٔ اول</p>
              <p className="text-2xl font-bold text-accent-green mt-1">
                {latestRankings.filter(r => r.position !== null && r.position <= 3).length}
              </p>
            </div>
            <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
              <p className="text-xs text-slate-400">۱۰ رتبهٔ اول</p>
              <p className="text-2xl font-bold text-brand-400 mt-1">
                {latestRankings.filter(r => r.position !== null && r.position <= 10).length}
              </p>
            </div>
            <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
              <p className="text-xs text-slate-400">۲۰ رتبهٔ اول</p>
              <p className="text-2xl font-bold text-accent-yellow mt-1">
                {latestRankings.filter(r => r.position !== null && r.position <= 20).length}
              </p>
            </div>
            <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
              <p className="text-xs text-slate-400">کلمات کلیدی پیگیری‌شده</p>
              <p className="text-2xl font-bold text-white mt-1">{latestRankings.length}</p>
            </div>
          </div>

          {/* Rankings Table */}
          <div className="bg-surface-2 border border-surface-3/50 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-3/50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">رتبهٔ کلمات کلیدی</h3>
              <span className="text-xs text-slate-400">
                <Calendar className="w-3 h-3 inline mr-1" />
                {rankings.length > 0 && `آخرین بررسی: ${formatDateOnly(rankings[0].date)}`}
              </span>
            </div>
            <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-surface-3/50">
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">کلمهٔ کلیدی</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">رتبه</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">تغییر</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">نشانی</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">بهترین</th>
                </tr>
              </thead>
              <tbody>
                {latestRankings.map((row, i) => (
                  <tr key={i} className="border-b border-surface-3/20 hover:bg-surface-3/20">
                    <td className="px-4 py-3 text-sm text-white font-medium">{row.keyword}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-bold ${
                        row.position === null ? 'text-slate-500' :
                        row.position <= 3 ? 'text-accent-green' : 
                        row.position <= 10 ? 'text-brand-400' : 
                        row.position <= 20 ? 'text-accent-yellow' : 'text-slate-300'
                      }`}>
                        {row.position === null ? <span title="در نتایج بررسی‌شده پیدا نشد">—</span> : toPersianDigits(row.position)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400">
                      {row.change !== null && row.change !== 0 ? <span dir="ltr">{row.change > 0 ? `+${toPersianDigits(row.change)}` : `−${toPersianDigits(-row.change)}`}</span> : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400"><span dir="ltr">{row.url || '—'}</span></td>
                    <td className="px-4 py-3 text-right text-xs text-slate-300">{row.best === null ? '—' : toPersianDigits(row.best)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </>
      )}
      {importPanel}
    </div>
  );
}
