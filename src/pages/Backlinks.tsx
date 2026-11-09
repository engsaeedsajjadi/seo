import { authenticatedFetch } from '../lib/api';
import { useState, useEffect } from 'react';
import { Link2, AlertCircle, Plus, RefreshCw, ExternalLink } from 'lucide-react';
import { useAppState } from '../lib/store';
import CsvImport from '../components/CsvImport';
import LinkDiscovery from '../components/LinkDiscovery';
import { toBacklinkRows } from '../lib/csv-parse';
import { formatPersianNumber as formatImportCount } from '../lib/persian';
import { t } from '../i18n';
import { apiMessage } from '../lib/labels';
import { toPersianDigits, formatPersianDate, formatPersianNumber, formatCurrency, formatRelativePersianTime } from '../lib/persian';

interface Backlink {
  id: string;
  sourceUrl: string;
  sourceDomain: string;
  targetUrl: string;
  anchorText: string;
  domainRating: number;
  isNofollow: boolean;
  status: string;
  provider: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export default function Backlinks() {
  const { state } = useAppState();
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [loading, setLoading] = useState(true);
  const [importRevision, setImportRevision] = useState(0);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!state.currentProject) {
        setLoading(false);
        return;
      }
      try {
        const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(state.currentProject.id)}/backlinks`, {
          credentials: 'include',
        });
        const json = await res.json();
        if (json.success) {
          setBacklinks(json.data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [state.currentProject, importRevision]);

  const syncReady = state.providerStatus.dataForSeo === 'connected';

  async function handleSync() {
    if (!state.currentProject) return;
    setSyncLoading(true);
    setSyncResult(null);
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(state.currentProject.id)}/backlinks/sync`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json();
      if (json.success) {
        setSyncResult('همگام‌سازی در صف قرار گرفت. نتیجه به‌زودی نمایش داده می‌شود.');
      } else {
        setSyncResult(apiMessage(json.error?.message));
      }
    } catch (e) {
      setSyncResult(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncLoading(false);
    }
  }

  if (!state.currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center" dir="rtl">
        <Link2 className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">پروژه‌ای انتخاب نشده</h2>
        <p className="text-slate-400">برای تحلیل بک‌لینک‌ها یک پروژه انتخاب یا ایجاد کنید.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">در حال بارگذاری بک‌لینک‌ها…</p>
        </div>
      </div>
    );
  }

  const importPanel = (
    <CsvImport
      title="ورود بک‌لینک از فایل"
      help="از بخش Links سرچ کنسول یا هر ابزار سئو خروجی CSV بگیرید. فقط ستون سایت یا صفحهٔ مبدأ الزامی است."
      endpoint={`/api/v1/projects/${state.currentProject.id}/backlinks/import`}
      toRows={toBacklinkRows}
      onImported={() => setImportRevision((n) => n + 1)}
      summary={(d) => `${formatImportCount(d.inserted)} بک‌لینک جدید و ${formatImportCount(d.refreshed)} بک‌لینک به‌روز شد.`}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">بک‌لینک‌ها</h1>
          <p className="text-sm text-slate-400 mt-1">سایت‌هایی که به <span className="text-brand-400">{state.currentProject?.domain}</span> لینک داده‌اند</p>
        </div>
        <div className="flex items-center gap-3">
          {syncReady && <button onClick={handleSync} disabled={syncLoading} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-50">
            {syncLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {syncLoading ? 'در حال ثبت در صف…' : 'همگام‌سازی بک‌لینک‌ها'}
          </button>}
        </div>
      </div>

      {state.currentProject && <LinkDiscovery projectId={state.currentProject.id} domain={state.currentProject.domain} />}

      {syncResult && (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4 text-sm text-slate-300">{syncResult}</div>
      )}

      {backlinks.length === 0 ? (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-12 text-center">
          <Link2 className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">هنوز بک‌لینکی ثبت نشده است</h3>
          <p className="text-sm text-slate-400 mb-4 max-w-lg mx-auto">{syncReady ? 'پس از همگام‌سازی، بک‌لینک‌ها اینجا نمایش داده می‌شوند.' : '«جست‌وجوی بک‌لینک‌ها» را در کادر بالا بزنید، یا از بخش Links سرچ کنسول خروجی CSV بگیرید و از کادر پایین صفحه وارد کنید.'}</p>
          {syncReady && <button onClick={handleSync} disabled={syncLoading} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
            {syncLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            همگام‌سازی بک‌لینک‌ها
          </button>}
        </div>
      ) : (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-surface-3/50">
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">مبدأ</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">مقصد</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">متن لینک</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">اعتبار دامنه</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Nofollow</th>
              </tr>
            </thead>
            <tbody>
              {backlinks.map(b => (
                <tr key={b.id} className="border-b border-surface-3/20 hover:bg-surface-3/20">
                  <td className="px-4 py-3 text-xs text-white font-mono"><a href={b.sourceUrl} target="_blank" rel="noopener" className="hover:text-brand-400 flex items-center gap-1">{b.sourceDomain} <ExternalLink className="w-3 h-3" /></a></td>
                  <td className="px-4 py-3 text-xs text-slate-400 font-mono">{b.targetUrl}</td>
                  <td className="px-4 py-3 text-xs text-slate-300">{b.anchorText || '—'}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-300">{b.domainRating ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-400">{b.isNofollow ? 'بله' : 'خیر'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
      {importPanel}
    </div>
  );
}
