import { authenticatedFetch } from '../lib/api';
import { useState, useEffect } from 'react';
import {
  Radio, AlertCircle, MessageSquare, CheckCircle2,
  HelpCircle, Zap, ExternalLink, Search, RefreshCw
} from 'lucide-react';
import { useAppState } from '../lib/store';
import { t } from '../i18n';
import { findingTitle, SEVERITY_LABELS } from '../lib/labels';
import { toPersianDigits, formatPersianDate, formatPersianNumber, formatCurrency, formatRelativePersianTime } from '../lib/persian';

interface AEOData {
  pages: Array<{ url: string; title: string; metaDescription: string }>;
  structuredDataFindings: Array<{ ruleId: string; severity: string; category: string }>;
  message: string;
}

export default function AEO() {
  const { state } = useAppState();
  const [data, setData] = useState<AEOData | null>(null);
  const [loading, setLoading] = useState(true);
  const [providerError, setProviderError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!state.currentProject) {
        setLoading(false);
        return;
      }
      try {
        const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(state.currentProject.id)}/aeo`, {
          credentials: 'include',
        });
        const json = await res.json();
        if (json.success) {
          setData(json.data);
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

  if (!state.currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center" dir="rtl">
        <Radio className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">پروژه‌ای انتخاب نشده</h2>
        <p className="text-slate-400">برای دیدن این بخش یک پروژه انتخاب یا ایجاد کنید.</p>
      </div>
    );
  }

  if (providerError) {
    return (
      <div className="space-y-6" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold text-white">آمادگی برای پاسخ مستقیم گوگل (AEO)</h1>
          <p className="text-sm text-slate-400 mt-1">گوگل برای بعضی پرسش‌ها جواب را مستقیم بالای نتایج نشان می‌دهد. این صفحه نشان می‌دهد سایت چقدر برای آن آماده است.</p>
        </div>
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-accent-yellow mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">سرویس هوش مصنوعی هنوز فعال نشده است</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
            سرویس هوش مصنوعی هنوز فعال نشده است.
          </p>
          <div className="bg-surface/50 rounded-lg p-4 max-w-sm mx-auto text-right">
            <p className="text-xs font-semibold text-slate-300 mb-2">این بخش پس از فعال‌شدن سرویس هوش مصنوعی در دسترس است:</p>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>• با فعال‌شدن سرویس، تحلیل به‌طور خودکار انجام می‌شود</li>
              <li>• نتیجه از صفحه‌های بررسی‌شده و یافته‌های داده ساختاریافته به‌دست می‌آید</li>
              <li>• پرسش‌ها از محتوای واقعی سایت شما استخراج می‌شوند</li>
              <li>• پوشش اسکیماهای FAQ، HowTo، Article و BreadcrumbList بررسی می‌شود</li>
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
          <p className="text-sm text-slate-400">در حال بارگذاری…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">آمادگی برای پاسخ مستقیم گوگل (AEO)</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">گوگل برای بعضی پرسش‌ها جواب را مستقیم بالای نتایج نشان می‌دهد. صفحه‌ای شانس دارد که عنوان و توضیح روشن داشته باشد و «دادهٔ ساختاریافته» (برچسب‌هایی که نوع محتوا را به گوگل می‌گویند) در آن درست باشد. اینجا هر دو را از آخرین بررسی سایت می‌بینید.</p>
        </div>
      </div>

      {data && (
        <>
          {/* Real Pages */}
          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-1">عنوان و توضیح صفحه‌ها</h3>
            <p className="text-xs text-slate-400 mb-4">همان متنی که گوگل از هر صفحه می‌خواند. صفحه‌ای که عنوان یا توضیح ندارد شانس کمی برای پاسخ مستقیم دارد.</p>
            {data.pages.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">هنوز سایت بررسی نشده است. از صفحهٔ «بررسی فنی سایت» یک بررسی اجرا کنید.</p>
            ) : (
              <div className="space-y-2">
                {data.pages.map((page, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-surface/50">
                    <MessageSquare className="w-4 h-4 text-brand-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p dir="ltr" className="text-xs text-slate-400 font-mono text-right break-all">{page.url}</p>
                      <p className="text-sm text-slate-200 mt-0.5">{page.title || <span className="text-accent-yellow">عنوان ندارد</span>}</p>
                      <p className="text-xs text-slate-500 mt-1">{page.metaDescription || <span className="text-accent-yellow">توضیحات متا ندارد</span>}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Structured Data Findings */}
          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">مشکل‌های دادهٔ ساختاریافته</h3>
            {data.structuredDataFindings.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">در آخرین بررسی، مشکلی در دادهٔ ساختاریافته پیدا نشد.</p>
            ) : (
              <div className="space-y-2">
                {data.structuredDataFindings.map((finding, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-surface/50">
                    <span className="text-xs text-slate-300">{findingTitle({ ruleId: finding.ruleId, title: finding.ruleId })}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">اهمیت: {SEVERITY_LABELS[finding.severity] ?? finding.severity}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-500 mt-3">این نتایج از آخرین بررسی سایت در صفحهٔ «بررسی فنی سایت» گرفته شده است.</p>
          </div>
        </>
      )}
    </div>
  );
}
