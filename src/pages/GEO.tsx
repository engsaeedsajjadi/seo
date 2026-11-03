import { authenticatedFetch } from '../lib/api';
import { useState, useEffect } from 'react';
import {
  Brain, AlertCircle, Sparkles, RefreshCw
} from 'lucide-react';
import { useAppState } from '../lib/store';
import { t } from '../i18n';
import { formatDateTime } from '../lib/labels';
import { toPersianDigits, formatPersianDate, formatPersianNumber, formatCurrency, formatRelativePersianTime } from '../lib/persian';

function geoPrompt(domain: string, language: string): string {
  return language === 'fa' ? `${domain} چیست و چه خدماتی ارائه می‌دهد؟` : `What is ${domain}?`;
}

interface GeoRun {
  id: string;
  prompt: string;
  response: string;
  brandMentioned: boolean;
  visibilityScore: number;
  provider: string;
  cost: number;
  createdAt: string;
}

export default function GEO() {
  const { state } = useAppState();
  const [runs, setRuns] = useState<GeoRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const [checkQueued, setCheckQueued] = useState(0);

  useEffect(() => {
    async function load() {
      if (!state.currentProject) {
        setLoading(false);
        return;
      }
      try {
        const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(state.currentProject.id)}/geo`, {
          credentials: 'include',
        });
        const json = await res.json();
        if (json.success) {
          setRuns(json.data);
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
    if (!checkQueued) return;
    // The check runs in the background, so look for its result for two minutes.
    const timer = setInterval(() => void load(), 6000);
    const stop = setTimeout(() => clearInterval(timer), 120000);
    return () => { clearInterval(timer); clearTimeout(stop); };
  }, [state.currentProject, checkQueued]);

  async function handleCheck() {
    if (!state.currentProject) return;
    setCheckLoading(true);
    setCheckResult(null);
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(state.currentProject.id)}/geo/check`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: geoPrompt(state.currentProject.domain, state.currentProject.language) }),
      });
      const json = await res.json();
      if (json.success) {
        setCheckQueued((n) => n + 1);
        setCheckResult(`بررسی در صف قرار گرفت. نتیجه به‌زودی اینجا نمایش داده می‌شود.`);
      } else {
        if (json.error?.code === 'PROVIDER_NOT_CONFIGURED') {
          setProviderError(json.error.message);
        }
        setCheckResult(`خطا: ${json.error?.message || 'ناموفق'}`);
      }
    } catch (e) {
      setCheckResult(e instanceof Error ? e.message : String(e));
    } finally {
      setCheckLoading(false);
    }
  }

  if (!state.currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center" dir="rtl">
        <Brain className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">پروژه‌ای انتخاب نشده</h2>
        <p className="text-slate-400">برای پیگیری دیده‌شدن در هوش مصنوعی یک پروژه انتخاب یا ایجاد کنید.</p>
      </div>
    );
  }

  if (providerError) {
    return (
      <div className="space-y-6" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold text-white">GEO / دیده‌شدن در هوش مصنوعی</h1>
          <p className="text-sm text-slate-400 mt-1">دیده‌شدن برند خود را در پاسخ‌های هوش مصنوعی پیگیری کنید</p>
        </div>
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-accent-yellow mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">سرویس هوش مصنوعی هنوز فعال نشده است</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
            سرویس هوش مصنوعی هنوز فعال نشده است.
          </p>
          <div className="bg-surface/50 rounded-lg p-4 max-w-sm mx-auto text-right">
            <p className="text-xs font-semibold text-slate-300 mb-2">برای فعال‌سازی:</p>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>• مدیر سیستم باید یک سرویس هوش مصنوعی را فعال کند</li>
              <li>• نام برند را در تنظیمات پروژه وارد کنید</li>
            </ul>
          </div>
          <button onClick={handleCheck} disabled={checkLoading} className="mt-4 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
            {checkLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            بررسی دوباره
          </button>
          {checkResult && <p className="mt-3 text-xs text-slate-400 max-w-md mx-auto">{checkResult}</p>}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">در حال بارگذاری نتایج…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">GEO / دیده‌شدن در هوش مصنوعی</h1>
          <p className="text-sm text-slate-400 mt-1">دیده‌شدن برند در پاسخ‌های هوش مصنوعی</p>
        </div>
        <button onClick={handleCheck} disabled={checkLoading} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-50">
          {checkLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {checkLoading ? 'در حال ثبت در صف…' : 'اجرای بررسی'}
        </button>
      </div>

      {checkResult && (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4 text-sm text-slate-300">{checkResult}</div>
      )}

      {runs.length === 0 ? (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-12 text-center">
          <Brain className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">هنوز بررسی‌ای انجام نشده است</h3>
          <p className="text-sm text-slate-400 mb-4">برای سنجش حضور برند خود در پاسخ‌های هوش مصنوعی، یک بررسی اجرا کنید.</p>
          <button onClick={handleCheck} disabled={checkLoading} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
            {checkLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            اجرای بررسی
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map(run => (
            <div key={run.id} className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm text-white font-medium">{run.prompt}</p>
                  <p className="text-xs text-slate-400 mt-1">سرویس: {run.provider === 'google' ? 'Gemini' : run.provider} · برند در پاسخ {run.brandMentioned ? 'دیده شد' : 'دیده نشد'} · امتیاز دیده‌شدن: {toPersianDigits(run.visibilityScore ?? 0)}</p>
                </div>
                <span className="text-[10px] text-slate-500">{formatDateTime(run.createdAt)}</span>
              </div>
              <p dir="auto" className="text-sm leading-7 text-slate-300 bg-surface/50 rounded p-3 whitespace-pre-line">{run.response}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
