import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Globe, Search, BarChart3, Shield, AlertTriangle, TrendingUp,
  TrendingDown, ArrowRight, Zap, Clock, Activity, CheckCircle2,
  XCircle
} from 'lucide-react';
import { useAppState } from '../lib/store';
import { api } from '../lib/api';
import { t } from '../i18n';
import { toPersianDigits, formatPersianNumber, formatPersianDate, formatRelativePersianTime } from '../lib/persian';
import type { AuditFinding, Job } from '../lib/types';

export default function Dashboard() {
  const { state } = useAppState();
  const [auditFindings, setAuditFindings] = useState<AuditFinding[]>([]);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const hasProject = state.currentProject !== null;

  useEffect(() => {
    async function loadData() {
      if (!state.currentProject) {
        setLoading(false);
        return;
      }

      try {
        const [findingsResult, jobsResult] = await Promise.all([
          api.getAuditFindings(state.currentProject.id),
          api.getJobs(state.currentProject.id),
        ]);
        if (findingsResult.success) setAuditFindings(findingsResult.data);
        if (jobsResult.success) setRecentJobs(jobsResult.data.slice(0, 5));
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [state.currentProject]);

  if (!hasProject) {
    return <EmptyState />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96" dir="rtl">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400 font-vazirmatn-regular">{t('common.loadingData')}</p>
        </div>
      </div>
    );
  }

  // Calculate real SEO score from audit findings
  const severityCounts = {
    critical: auditFindings.filter(f => f.severity === 'critical').length,
    high: auditFindings.filter(f => f.severity === 'high').length,
    medium: auditFindings.filter(f => f.severity === 'medium').length,
    low: auditFindings.filter(f => f.severity === 'low').length,
    notice: auditFindings.filter(f => f.severity === 'notice').length,
  };

  const seoScore = auditFindings.length > 0
    ? Math.max(0, Math.round(100 - (severityCounts.critical * 10 + severityCounts.high * 5 + severityCounts.medium * 2 + severityCounts.low * 1)))
    : null;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-vazirmatn-bold">{t('dashboard.title')}</h1>
          <p className="text-sm text-slate-400 mt-1 font-vazirmatn-regular">
            {t('dashboard.overview')} برای <span className="text-brand-400 ltr-content">{state.currentProject?.domain}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 flex items-center gap-1 font-vazirmatn-light">
            <Clock className="w-3 h-3" />
            {state.currentProject?.lastCrawlAt 
              ? `آخرین خزش: ${formatPersianDate(state.currentProject.lastCrawlAt, { format: 'short' })}`
              : 'هنوز خزشی انجام نشده'}
          </span>
          <Link
            to="/audit"
            aria-label={t('dashboard.runAudit')}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 font-vazirmatn-medium"
          >
            <Zap className="w-4 h-4" />
            {t('dashboard.runAudit')}
          </Link>
        </div>
      </div>

      {/* SEO Score Card */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 bg-gradient-to-br from-brand-600/20 to-brand-800/20 border border-brand-600/30 rounded-xl p-6">
          <p className="text-xs font-medium text-brand-300 uppercase tracking-wider font-vazirmatn-medium">{t('dashboard.seoScore')}</p>
          {seoScore !== null ? (
            <>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-5xl font-bold text-white persian-numbers">{toPersianDigits(seoScore)}</span>
                <span className="text-sm text-slate-400 mb-2">/۱۰۰</span>
              </div>
              <p className="text-xs text-slate-400 mt-2 font-vazirmatn-light">بر اساس {toPersianDigits(auditFindings.length)} یافته ممیزی</p>
            </>
          ) : (
            <>
              <div className="mt-3">
                <span className="text-2xl font-bold text-slate-400 font-vazirmatn-bold">{t('common.noData')}</span>
              </div>
              <p className="text-xs text-slate-400 mt-2 font-vazirmatn-light">برای محاسبه امتیاز، ممیزی اجرا کنید</p>
            </>
          )}
          <Link to="/audit" className="mt-4 inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 font-vazirmatn-regular">
            مشاهده جزئیات ممیزی <ArrowRight className="w-3 h-3 rotate-180" />
          </Link>
        </div>

        <StatCard
          title="یافته‌های ممیزی"
          value={toPersianDigits(auditFindings.length)}
          subtitle={`${toPersianDigits(severityCounts.critical)} بحرانی، ${toPersianDigits(severityCounts.high)} مهم`}
          icon={Shield}
          link="/audit"
        />
        <StatCard
          title="کارهای فعال"
          value={toPersianDigits(recentJobs.filter(j => j.status === 'running' || j.status === 'pending').length)}
          subtitle={`${toPersianDigits(recentJobs.filter(j => j.status === 'completed').length)} اخیراً تکمیل شده`}
          icon={Activity}
          link="/automation"
        />
        <StatCard
          title="وضعیت سرویس‌ها"
          value={`${toPersianDigits(Object.values(state.providerStatus).filter(s => s === 'connected').length)}/${toPersianDigits(Object.keys(state.providerStatus).length)}`}
          subtitle="یکپارچه‌سازی متصل"
          icon={CheckCircle2}
          link="/integrations"
        />
      </div>

      {/* Recent Audit Findings */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white font-vazirmatn-bold">یافته‌های اخیر ممیزی</h3>
          <Link to="/audit" className="text-xs text-brand-400 hover:text-brand-300 font-vazirmatn-regular">مشاهده همه ←</Link>
        </div>
        {auditFindings.length === 0 ? (
          <div className="text-center py-8">
            <Shield className="w-12 h-12 text-slate-500 mx-auto mb-3" />
            <p className="text-sm text-slate-400 font-vazirmatn-regular">هنوز یافته‌ای وجود ندارد</p>
            <p className="text-xs text-slate-500 mt-1 font-vazirmatn-light">برای شناسایی مشکلات سئو، ممیزی سایت را اجرا کنید</p>
          </div>
        ) : (
          <div className="space-y-3">
            {auditFindings.slice(0, 6).map((finding) => (
              <div key={finding.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-3/30">
                <SeverityBadge severity={finding.severity} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate font-vazirmatn-regular">{finding.title}</p>
                  <p className="text-xs text-slate-500 font-vazirmatn-light">{finding.category} · {toPersianDigits(finding.affectedUrls.length)} آدرس</p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 rotate-180" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Jobs */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white font-vazirmatn-bold">کارهای اخیر</h3>
          <Link to="/automation" className="text-xs text-brand-400 hover:text-brand-300 font-vazirmatn-regular">مشاهده همه ←</Link>
        </div>
        {recentJobs.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="w-12 h-12 text-slate-500 mx-auto mb-3" />
            <p className="text-sm text-slate-400 font-vazirmatn-regular">هنوز کاری وجود ندارد</p>
            <p className="text-xs text-slate-500 mt-1 font-vazirmatn-light">کارها هنگام اجرای ممیزی، خزش یا عملیات دیگر اینجا نمایش داده می‌شوند</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentJobs.map((job) => (
              <div key={job.id} className="flex items-center gap-3 p-2 rounded-lg">
                <JobStatusIcon status={job.status} />
                <div className="flex-1">
                  <p className="text-xs font-medium text-slate-200 font-vazirmatn-medium">{job.type.replace(/_/g, ' ')}</p>
                  <p className="text-[10px] text-slate-500 font-vazirmatn-light">
                    {job.status === 'running' && 'در حال اجرا...'}
                    {job.status === 'completed' && `تکمیل شده ${job.completedAt ? formatRelativePersianTime(job.completedAt) : ''}`}
                    {job.status === 'failed' && `ناموفق: ${job.error || 'خطای ناشناخته'}`}
                    {job.status === 'pending' && 'در صف'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Provider Status Banner */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3 font-vazirmatn-bold">وضعیت یکپارچه‌سازی‌ها</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {Object.entries(state.providerStatus).map(([key, status]) => (
            <div key={key} className="flex flex-col items-center gap-2 p-3 rounded-lg bg-surface/50">
              <div className={`w-3 h-3 rounded-full ${
                status === 'connected' ? 'bg-accent-green' :
                status === 'error' ? 'bg-accent-red' :
                'bg-accent-yellow'
              }`} />
              <span className="text-[10px] text-slate-400 text-center font-vazirmatn-light">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
              <span className={`text-[10px] font-vazirmatn-regular ${
                status === 'connected' ? 'text-accent-green' :
                status === 'error' ? 'text-accent-red' :
                'text-accent-yellow'
              }`}>
                {status === 'connected' ? 'فعال' : 'نیاز به تنظیم'}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500 font-vazirmatn-light">
          برای فعال‌سازی جمع‌آوری داده، سرویس‌ها را در <Link to="/integrations" className="text-brand-400 hover:text-brand-300">یکپارچه‌سازی‌ها</Link> پیکربندی کنید.
        </p>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon: Icon, link }: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  link: string;
}) {
  return (
    <Link to={link} className="bg-surface-2 border border-surface-3/50 rounded-xl p-5 hover:border-brand-600/30 transition-colors">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider font-vazirmatn-medium">{title}</p>
        <Icon className="w-4 h-4 text-slate-500" />
      </div>
      <p className="text-2xl font-bold text-white mt-2 persian-numbers font-vazirmatn-bold">{value}</p>
      <p className="text-xs text-slate-500 mt-1 font-vazirmatn-light">{subtitle}</p>
    </Link>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    notice: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  };
  const labels: Record<string, string> = {
    critical: 'بحرانی',
    high: 'زیاد',
    medium: 'متوسط',
    low: 'کم',
    notice: 'اطلاعاتی',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-medium border font-vazirmatn-medium ${colors[severity] || colors.notice}`}>
      {labels[severity] || severity}
    </span>
  );
}

function JobStatusIcon({ status }: { status: string }) {
  if (status === 'running') return <Activity className="w-4 h-4 text-brand-400 animate-pulse" />;
  if (status === 'completed') return <CheckCircle2 className="w-4 h-4 text-accent-green" />;
  if (status === 'failed') return <XCircle className="w-4 h-4 text-accent-red" />;
  return <Clock className="w-4 h-4 text-slate-400" />;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center" dir="rtl">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500/20 to-brand-700/20 border border-brand-600/30 flex items-center justify-center mb-6">
        <Globe className="w-10 h-10 text-brand-400" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-2 font-vazirmatn-bold">به رنک‌فورج خوش آمدید</h2>
      <p className="text-slate-400 max-w-md mb-6 font-vazirmatn-regular">
        اولین پروژه خود را ایجاد کنید تا نظارت بر عملکرد سئو وب‌سایت، ردیابی رتبه‌ها و خودکارسازی فرآیند سئو را شروع کنید.
      </p>
      <Link
        to="/projects"
        aria-label="ایجاد پروژه"
        className="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg flex items-center gap-2 font-vazirmatn-medium"
      >
        <Globe className="w-4 h-4" />
        ایجاد پروژه
      </Link>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl">
        {[
          { step: '۱', title: 'ایجاد پروژه', desc: 'دامنه وب‌سایت خود را اضافه و تنظیمات را پیکربندی کنید' },
          { step: '۲', title: 'اجرای ممیزی اولیه', desc: 'سایت خود را خزش کنید و مشکلات سئو را شناسایی کنید' },
          { step: '۳', title: 'ردیابی و بهینه‌سازی', desc: 'رتبه‌ها را نظارت کنید و سئو خود را بهبود دهید' },
        ].map(item => (
          <div key={item.step} className="bg-surface-2 border border-surface-3/50 rounded-xl p-4 text-right">
            <div className="w-8 h-8 rounded-lg bg-brand-600/20 flex items-center justify-center text-brand-400 font-bold text-sm mb-3 persian-numbers font-vazirmatn-bold">
              {item.step}
            </div>
            <h4 className="text-sm font-semibold text-white font-vazirmatn-bold">{item.title}</h4>
            <p className="text-xs text-slate-400 mt-1 font-vazirmatn-light">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
