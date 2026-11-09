import { authenticatedFetch } from '../lib/api';
import { useState, useEffect } from 'react';
import { Target, Plus, AlertCircle, Globe, RefreshCw } from 'lucide-react';
import { useAppState } from '../lib/store';
import { api } from '../lib/api';
import { t } from '../i18n';
import { apiMessage, formatDateOnly } from '../lib/labels';
import { toPersianDigits, formatPersianDate, formatPersianNumber, formatCurrency, formatRelativePersianTime } from '../lib/persian';

interface Competitor {
  id: string;
  domain: string;
  createdAt?: string;
  created_at?: string;
}

export default function Competitors() {
  const { state } = useAppState();
  const [showAddModal, setShowAddModal] = useState(false);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerStatus, setProviderStatus] = useState<any>(null);
  const [domainInput, setDomainInput] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!state.currentProject) {
        setLoading(false);
        return;
      }
      try {
        const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(state.currentProject.id)}/competitors`, {
          credentials: 'include',
        });
        const json = await res.json();
        if (json.success) {
          setCompetitors(json.data);
          setProviderStatus(json.meta?.provider);
        } else {
          // If provider not configured, still show competitors with status
          if (json.error?.code === 'PROVIDER_NOT_CONFIGURED' || json.meta?.provider) {
            setProviderStatus(json.meta?.provider || { configured: false });
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [state.currentProject]);

  async function handleAdd() {
    if (!state.currentProject || !domainInput.trim()) return;
    setAddLoading(true);
    setAddError(null);
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(state.currentProject.id)}/competitors`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domainInput.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setCompetitors(prev => [...prev, json.data]);
        setAddSuccess(`رقیب ${json.data.domain} اضافه شد`);
        setDomainInput('');
        setShowAddModal(false);
      } else {
        setAddError(apiMessage(json.error?.message, 'افزودن انجام نشد'));
      }
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddLoading(false);
    }
  }

  if (!state.currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center" dir="rtl">
        <Target className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">پروژه‌ای انتخاب نشده</h2>
        <p className="text-slate-400">برای تحلیل رقبا یک پروژه انتخاب یا ایجاد کنید.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">تحلیل رقبا</h1>
          <p className="text-sm text-slate-400 mt-1">تحلیل رقابتی <span className="text-brand-400">{state.currentProject?.domain}</span> </p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
          <Plus className="w-4 h-4" /> افزودن رقیب
        </button>
      </div>

      {providerStatus && (
        <div className={`border rounded-xl p-4 ${providerStatus.configured ? 'bg-surface-2 border-surface-3/50' : 'bg-accent-yellow/10 border-accent-yellow/30'}`}>
          <p className="text-xs text-slate-300">
            {providerStatus.configured ? 'دادهٔ رقبا فعال است.' : 'فعلاً پیگیری رقبا به‌صورت دستی است. مقایسهٔ خودکار پس از فعال‌شدن سرویس داده نمایش داده می‌شود.'}
          </p>
          
        </div>
      )}

      {addSuccess && (
        <div className="bg-accent-green/20 border border-accent-green/30 rounded-xl p-4 text-sm text-accent-green">{addSuccess}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : competitors.length === 0 ? (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-12 text-center">
          <Target className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">هنوز رقیبی اضافه نشده است</h3>
          <p className="text-sm text-slate-400 mb-4">برای شروع تحلیل، دامنهٔ رقبا را اضافه کنید.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> افزودن رقیب
          </button>
        </div>
      ) : (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-surface-3/50">
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">دامنه</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">افزوده‌شده</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {competitors.map(c => (
                <tr key={c.id} className="border-b border-surface-3/20 hover:bg-surface-3/20">
                  <td className="px-4 py-3 text-sm text-white font-medium flex items-center gap-2"><Globe className="w-4 h-4 text-slate-500" />{c.domain}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{formatDateOnly(c.createdAt ?? c.created_at)}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-400">مقایسهٔ کلمه‌های مشترک هنوز در دسترس نیست</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form onSubmit={(e) => { e.preventDefault(); void handleAdd(); }} className="w-full max-w-md bg-surface-2 border border-surface-3/50 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">افزودن رقیب</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">دامنهٔ رقیب</label>
                <input type="text" dir="ltr" autoFocus value={domainInput} onChange={e => setDomainInput(e.target.value)} placeholder="competitor.com" className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50" />
              </div>
              <p className="text-xs text-slate-400">نشانی‌های داخلی و خصوصی پذیرفته نمی‌شوند.</p>
              {addError && <p className="text-xs text-accent-red">{addError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button type="button" onClick={() => setShowAddModal(false)} disabled={addLoading} className="px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-50">انصراف</button>
              <button type="submit" disabled={addLoading} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-50">
                {addLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                {addLoading ? 'در حال افزودن…' : 'افزودن'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
