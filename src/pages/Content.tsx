import { authenticatedFetch } from '../lib/api';
import { useState, useEffect } from 'react';
import {
  FileText, Plus, Bot, Sparkles, AlertCircle,
  CheckCircle2, Clock, RefreshCw
} from 'lucide-react';
import { useAppState } from '../lib/store';
import { t } from '../i18n';
import { toPersianDigits, formatPersianDate, formatPersianNumber, formatCurrency, formatRelativePersianTime } from '../lib/persian';

interface ContentBrief {
  id: string;
  title: string;
  targetKeyword: string;
  intent: string;
  status: string;
  wordCount: number;
  createdAt: string;
}

export default function Content() {
  const { state } = useAppState();
  const [briefs, setBriefs] = useState<ContentBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateBrief, setShowCreateBrief] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', targetKeyword: '', intent: 'informational', wordCount: 2000 });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!state.currentProject) {
        setLoading(false);
        return;
      }
      try {
        const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(state.currentProject.id)}/content/briefs`, {
          credentials: 'include',
        });
        const json = await res.json();
        if (json.success) {
          setBriefs(json.data);
          setProviderError(null);
        } else if (json.error?.code === 'PROVIDER_NOT_CONFIGURED') {
          setProviderError(json.error.message);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [state.currentProject]);

  async function handleCreate() {
    if (!state.currentProject) return;
    if (!form.title.trim() || !form.targetKeyword.trim()) {
      setCreateError('عنوان و کلمهٔ کلیدی الزامی است');
      return;
    }
    setCreateLoading(true);
    setCreateError(null);
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(state.currentProject.id)}/content/briefs`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.success) {
        setBriefs(prev => [json.data.brief, ...prev]);
        setCreateSuccess('بریف در صف تولید قرار گرفت.');
        setShowCreateBrief(false);
        setForm({ title: '', targetKeyword: '', intent: 'informational', wordCount: 2000 });
      } else {
        if (json.error?.code === 'PROVIDER_NOT_CONFIGURED') {
          setProviderError(json.error.message);
        }
        setCreateError(json.error?.message || 'انجام نشد');
      }
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreateLoading(false);
    }
  }

  if (!state.currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center" dir="rtl">
        <FileText className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">پروژه‌ای انتخاب نشده</h2>
        <p className="text-slate-400">برای مدیریت محتوا یک پروژه انتخاب یا ایجاد کنید.</p>
      </div>
    );
  }

  if (providerError) {
    return (
      <div className="space-y-6" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold text-white">موتور محتوا</h1>
          <p className="text-sm text-slate-400 mt-1">تولید و بهینه‌سازی محتوا با کمک هوش مصنوعی</p>
        </div>
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-accent-yellow mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">سرویس هوش مصنوعی هنوز فعال نشده است</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
            سرویس هوش مصنوعی هنوز فعال نشده است.
          </p>
          <div className="bg-surface/50 rounded-lg p-4 max-w-sm mx-auto text-left">
            <p className="text-xs font-semibold text-slate-300 mb-2">سرویس‌های پشتیبانی‌شده:</p>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>• OpenAI</li>
              <li>• Anthropic</li>
              <li>• Google AI</li>
              <li>• Perplexity</li>
              <li>• مدیر سیستم باید یکی از این سرویس‌ها را فعال کند</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">در حال بارگذاری بریف‌ها…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">موتور محتوا</h1>
          <p className="text-sm text-slate-400 mt-1">تولید محتوا با کمک هوش مصنوعی</p>
        </div>
        <button onClick={() => setShowCreateBrief(true)} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> ایجاد بریف
        </button>
      </div>

      {createSuccess && (
        <div className="bg-accent-green/20 border border-accent-green/30 rounded-xl p-4 text-sm text-accent-green">{createSuccess}</div>
      )}

      {/* Content Briefs */}
      {briefs.length === 0 ? (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-12 text-center">
          <FileText className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">هنوز بریفی ایجاد نشده است</h3>
          <p className="text-sm text-slate-400 mb-4">اولین بریف محتوای خود را بسازید.</p>
          <button onClick={() => setShowCreateBrief(true)} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> ایجاد بریف
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {briefs.map((brief) => (
            <div key={brief.id} className="bg-surface-2 border border-surface-3/50 rounded-xl p-5 hover:border-brand-600/30 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">{brief.title}</h3>
                  <p className="text-xs text-slate-400 mt-1">{brief.targetKeyword}{brief.wordCount} words</p>
                </div>
                <StatusBadge status={brief.status} />
              </div>
              {Array.isArray((brief as any).outline?.sections) && (
                <details className="mt-4 text-xs text-slate-300">
                  <summary className="cursor-pointer text-brand-400 flex items-center gap-1"><FileText className="w-3 h-3" /> مشاهدهٔ ساختار</summary>
                  <ul className="mt-2 space-y-1 list-disc pr-4">
                    {(brief as any).outline.sections.map((section: any, i: number) => (
                      <li key={i}>{typeof section === 'string' ? section : section.heading || section.title}</li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="text-[10px] text-slate-500 mt-3">ایجادشده {new Date(brief.createdAt).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}

      {showCreateBrief && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface-2 border border-surface-3/50 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">ایجاد بریف محتوا</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">عنوان</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="راهنمای کامل سئوی فنی" className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">کلمهٔ کلیدی یا موضوع</label>
                <input type="text" value={form.targetKeyword} onChange={e => setForm(f => ({ ...f, targetKeyword: e.target.value }))} placeholder="مثلاً: راهنمای ممیزی سئوی فنی" className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">هدف جست‌وجو</label>
                  <select value={form.intent} onChange={e => setForm(f => ({ ...f, intent: e.target.value }))} className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white">
                    <option value="informational">اطلاعاتی</option>
                    <option value="commercial">تجاری</option>
                    <option value="transactional">تراکنشی</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">تعداد کلمات</label>
                  <input type="number" value={form.wordCount} onChange={e => setForm(f => ({ ...f, wordCount: parseInt(e.target.value) || 1000 }))} min={100} max={5000} className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white" />
                </div>
              </div>
              {createError && <p className="text-xs text-accent-red">{createError}</p>}
              <div className="bg-surface/50 rounded-lg p-3">
                <p className="text-xs text-slate-400">
                  <Bot className="w-3.5 h-3.5 inline mr-1 text-accent-purple" />
                  
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowCreateBrief(false)} disabled={createLoading} className="px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-50">انصراف</button>
              <button onClick={handleCreate} disabled={createLoading} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-50">
                {createLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {createLoading ? 'در حال ثبت در صف…' : 'تولید'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ready: 'bg-green-500/20 text-green-400',
    draft: 'bg-slate-500/20 text-slate-400',
    in_progress: 'bg-brand-500/20 text-brand-400',
    completed: 'bg-green-500/20 text-green-400',
  };
  const labels: Record<string, string> = {
    ready: 'Ready',
    draft: 'Draft',
    in_progress: 'In Progress — worker job',
    completed: 'Completed',
  };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${styles[status] || 'bg-slate-500/20 text-slate-400'}`}>{labels[status] || status}</span>;
}
