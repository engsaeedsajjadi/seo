import { authenticatedFetch } from '../lib/api';
import { useState, useEffect } from 'react';
import { Link2, AlertCircle, Plus, RefreshCw, ExternalLink } from 'lucide-react';
import { useAppState } from '../lib/store';
import { t } from '../i18n';
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
  const [providerError, setProviderError] = useState<string | null>(null);
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
          setProviderError(null);
        } else if (json.error?.code === 'PROVIDER_NOT_CONFIGURED') {
          setProviderError(json.error.message);
          setBacklinks([]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [state.currentProject]);

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
        if (json.error?.code === 'PROVIDER_NOT_CONFIGURED') {
          setProviderError(json.error.message);
        }
        setSyncResult(`خطا: ${json.error?.message || 'ناموفق'}`);
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

  if (providerError) {
    return (
      <div className="space-y-6" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold text-white">بک‌لینک‌ها</h1>
          <p className="text-sm text-slate-400 mt-1">نمایهٔ بک‌لینک خود را زیر نظر بگیرید</p>
        </div>
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-accent-yellow mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">سرویس‌دهندهٔ داده هنوز فعال نشده است</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
            سرویس‌دهندهٔ داده هنوز فعال نشده است.
          </p>
          <div className="bg-surface/50 rounded-lg p-4 max-w-sm mx-auto text-left">
            <p className="text-xs font-semibold text-slate-300 mb-2">برای فعال‌سازی:</p>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>• مدیر سیستم باید اتصال DataForSEO را تنظیم کند</li>
              <li>• پس از آن می‌توانید بک‌لینک‌ها را همگام‌سازی کنید</li>
            </ul>
          </div>
          <button onClick={handleSync} disabled={syncLoading} className="mt-4 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
            {syncLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
            Check Provider Status
          </button>
          {syncResult && <p className="mt-3 text-xs text-slate-400">{syncResult}</p>}
        </div>
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">بک‌لینک‌ها</h1>
          <p className="text-sm text-slate-400 mt-1">نمایهٔ بک‌لینک <span className="text-brand-400">{state.currentProject?.domain}</span> </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleSync} disabled={syncLoading} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-50">
            {syncLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {syncLoading ? 'در حال ثبت در صف…' : 'همگام‌سازی بک‌لینک‌ها'}
          </button>
        </div>
      </div>

      {syncResult && (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4 text-sm text-slate-300">{syncResult}</div>
      )}

      {backlinks.length === 0 ? (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-12 text-center">
          <Link2 className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">هنوز بک‌لینکی ثبت نشده است</h3>
          <p className="text-sm text-slate-400 mb-4">پس از همگام‌سازی، بک‌لینک‌ها اینجا نمایش داده می‌شوند.</p>
          <button onClick={handleSync} disabled={syncLoading} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
            {syncLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Sync Backlinks — Queues BACKLINK_SYNC Job
          </button>
        </div>
      ) : (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-3/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">مبدأ</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">مقصد</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">متن لینک</th>
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
          </table>
        </div>
      )}
    </div>
  );
}
