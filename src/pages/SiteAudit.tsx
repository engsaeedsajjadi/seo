import { useState, useEffect } from 'react';
import {
  Shield, AlertTriangle, CheckCircle2, XCircle, Clock, Play,
  ChevronDown, ChevronRight, Download, Filter, AlertCircle, Zap
} from 'lucide-react';
import { useAppState } from '../lib/store';
import { api } from '../lib/api';
import type { Severity, AuditCategory, AuditFinding } from '../lib/types';
import { t } from '../i18n';
import { toPersianDigits, formatPersianDate, formatPersianNumber, formatCurrency, formatRelativePersianTime } from '../lib/persian';

export default function SiteAudit() {
  const { state } = useAppState();
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeverity, setSelectedSeverity] = useState<Severity | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<AuditCategory | 'all'>('all');
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [showRunCrawl, setShowRunCrawl] = useState(false);
  const [crawlOptions, setCrawlOptions] = useState({ maxDepth: 5, maxPages: 500 });
  const [crawlLoading, setCrawlLoading] = useState(false);
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [crawlSuccess, setCrawlSuccess] = useState<string | null>(null);

  const hasProject = state.currentProject !== null;

  useEffect(() => {
    async function loadFindings() {
      if (!state.currentProject) {
        setLoading(false);
        return;
      }

      try {
        const result = await api.getAuditFindings(state.currentProject.id);
        if (result.success) setFindings(result.data);
      } catch (error) {
        console.error('Failed to load audit findings:', error);
      } finally {
        setLoading(false);
      }
    }

    loadFindings();
  }, [state.currentProject]);

  async function handleStartCrawl() {
    if (!state.currentProject) return;
    setCrawlLoading(true);
    setCrawlError(null);
    setCrawlSuccess(null);
    try {
      const result = await api.startCrawl(state.currentProject.id, {
        maxDepth: crawlOptions.maxDepth,
        maxPages: crawlOptions.maxPages,
      });
      if (result.success) {
        setCrawlSuccess('خزش در صف قرار گرفت. نتیجه به‌زودی نمایش داده می‌شود.');
        setShowRunCrawl(false);
        // Optionally refresh findings after delay
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setCrawlError(result.error.message);
      }
    } catch (e) {
      setCrawlError(e instanceof Error ? e.message : String(e));
    } finally {
      setCrawlLoading(false);
    }
  }

  if (!hasProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center" dir="rtl">
        <Shield className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">پروژه‌ای انتخاب نشده</h2>
        <p className="text-slate-400">برای اجرای ممیزی سایت، پروژه‌ای انتخاب یا ایجاد کنید.</p>
      </div>
    );
  }

  const filteredFindings = findings.filter(f => {
    if (selectedSeverity !== 'all' && f.severity !== selectedSeverity) return false;
    if (selectedCategory !== 'all' && f.category !== selectedCategory) return false;
    return true;
  });

  const severityCounts = {
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
    notice: findings.filter(f => f.severity === 'notice').length,
  };

  const overallScore = findings.length > 0
    ? Math.max(0, Math.round(100 - (severityCounts.critical * 10 + severityCounts.high * 5 + severityCounts.medium * 2 + severityCounts.low * 1)))
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">در حال بارگذاری یافته‌ها…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ممیزی سایت</h1>
          <p className="text-sm text-slate-400 mt-1">
            تحلیل سئوی فنی <span className="text-brand-400">{state.currentProject?.domain}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button disabled title="به‌زودی در دسترس خواهد بود" className="px-4 py-2 bg-surface-3/50 hover:bg-surface-3 text-slate-300 text-sm font-medium rounded-lg flex items-center gap-2">
            <Download className="w-4 h-4" />
            خروجی
          </button>
          <button
            onClick={() => setShowRunCrawl(true)}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            اجرای خزش
          </button>
        </div>
      </div>

      {crawlSuccess && (
        <div className="bg-accent-green/20 border border-accent-green/30 rounded-xl p-4 text-sm text-accent-green">
          {crawlSuccess}
        </div>
      )}
      {crawlError && (
        <div className="bg-accent-red/20 border border-accent-red/30 rounded-xl p-4 text-sm text-accent-red">
          {crawlError}
        </div>
      )}

      {/* Score Overview */}
      {overallScore !== null ? (
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="md:col-span-1 bg-surface-2 border border-surface-3/50 rounded-xl p-5 flex flex-col items-center justify-center">
            <div className={`text-4xl font-bold ${overallScore >= 80 ? 'text-accent-green' : overallScore >= 60 ? 'text-accent-yellow' : 'text-accent-red'}`}>
              {overallScore}
            </div>
            <p className="text-xs text-slate-400 mt-1">امتیاز کلی</p>
            <p className="text-[10px] text-slate-500 mt-1">بر اساس {findings.length} یافته</p>
          </div>
          <SeverityCard severity="critical" count={severityCounts.critical} total={findings.length} />
          <SeverityCard severity="high" count={severityCounts.high} total={findings.length} />
          <SeverityCard severity="medium" count={severityCounts.medium} total={findings.length} />
          <SeverityCard severity="low" count={severityCounts.low} total={findings.length} />
          <SeverityCard severity="notice" count={severityCounts.notice} total={findings.length} />
        </div>
      ) : (
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-accent-yellow mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">هنوز ممیزی‌ای انجام نشده است</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
            برای تحلیل سایت و پیداکردن مشکلات سئو، خزش سایت را اجرا کنید.
          </p>
          <button
            onClick={() => setShowRunCrawl(true)}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2"
          >
            <Zap className="w-4 h-4" />
            اجرای خزش
          </button>
        </div>
      )}

      {/* Filters */}
      {findings.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={selectedSeverity}
              onChange={e => setSelectedSeverity(e.target.value as Severity | 'all')}
              className="px-3 py-1.5 bg-surface-2 border border-surface-3/50 rounded-lg text-xs text-white focus:outline-none focus:border-brand-600/50"
            >
              <option value="all">همهٔ شدت‌ها</option>
              <option value="critical">بحرانی</option>
              <option value="high">زیاد</option>
              <option value="medium">متوسط</option>
              <option value="low">کم</option>
              <option value="notice">اطلاع</option>
            </select>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value as AuditCategory | 'all')}
              className="px-3 py-1.5 bg-surface-2 border border-surface-3/50 rounded-lg text-xs text-white focus:outline-none focus:border-brand-600/50"
            >
              <option value="all">همهٔ دسته‌ها</option>
              <option value="crawlability">قابلیت خزش</option>
              <option value="indexability">قابلیت ایندکس</option>
              <option value="metadata">متادیتا</option>
              <option value="content">محتوا</option>
              <option value="links">لینک‌ها</option>
              <option value="images">تصاویر</option>
              <option value="performance">کارایی</option>
              <option value="security">امنیت</option>
              <option value="structured-data">داده ساختاریافته</option>
              <option value="international">سئوی بین‌المللی</option>
            </select>
            <span className="text-xs text-slate-500 ml-auto">
              نمایش {filteredFindings.length} از {findings.length} یافته
            </span>
          </div>

          {/* Findings List */}
          <div className="space-y-2">
            {filteredFindings.map(finding => (
              <div key={finding.id} className="bg-surface-2 border border-surface-3/50 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedRule(expandedRule === finding.id ? null : finding.id)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-surface-3/20 text-left"
                >
                  <SeverityIcon severity={finding.severity} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-500">{finding.ruleId}</span>
                      <span className="text-sm font-medium text-white">{finding.title}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{finding.category} · {finding.affectedUrls.length} URL{finding.affectedUrls.length !== 1 ? 's' : ''} affected — evidence-based</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    finding.status === 'open' ? 'bg-red-500/20 text-red-400' :
                    finding.status === 'fixed' ? 'bg-green-500/20 text-green-400' :
                    'bg-slate-500/20 text-slate-400'
                  }`}>
                    {finding.status}
                  </span>
                  {expandedRule === finding.id ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </button>

                {expandedRule === finding.id && (
                  <div className="px-4 pb-4 border-t border-surface-3/30 pt-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-xs font-semibold text-slate-300 mb-1">توضیح</h4>
                        <p className="text-xs text-slate-400">{finding.description}</p>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-slate-300 mb-1">پیشنهاد</h4>
                        <p className="text-xs text-slate-400">{finding.recommendation}</p>
                      </div>
                    </div>
                    {finding.affectedUrls.length > 0 && (
                      <div className="mt-3">
                        <h4 className="text-xs font-semibold text-slate-300 mb-1">صفحات درگیر</h4>
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {finding.affectedUrls.slice(0, 10).map((url, i) => (
                            <p key={i} className="text-xs text-slate-400 font-mono truncate">{url}</p>
                          ))}
                          {finding.affectedUrls.length > 10 && (
                            <p className="text-xs text-slate-500">… و {finding.affectedUrls.length - 10} more</p>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <button disabled title="به‌زودی در دسترس خواهد بود" className="px-3 py-1.5 bg-accent-green/20 text-accent-green text-xs rounded-lg hover:bg-accent-green/30">
                        علامت‌گذاری به‌عنوان رفع‌شده
                      </button>
                      <button disabled title="به‌زودی در دسترس خواهد بود" className="px-3 py-1.5 bg-surface-3/50 text-slate-300 text-xs rounded-lg hover:bg-surface-3">
                        نادیده‌گرفتن
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Run Crawl Modal */}
      {showRunCrawl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface-2 border border-surface-3/50 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-2">اجرای خزش سایت</h2>
            <p className="text-sm text-slate-400 mb-4">
              این کار خزش این دامنه را انجام می‌دهد: {state.currentProject?.domain}
            </p>
            <div className="bg-surface/50 border border-surface-3/30 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-2 text-xs text-accent-yellow">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>هر خزش ۵ اعتبار مصرف می‌کند. اگر خزش ناموفق شود، اعتبار برمی‌گردد.</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs text-slate-400">حداکثر عمق (۱ تا ۱۰)</label>
                <input type="number" value={crawlOptions.maxDepth} onChange={e => setCrawlOptions(o => ({ ...o, maxDepth: parseInt(e.target.value) || 1 }))} min={1} max={10} className="w-full mt-1 px-3 py-2 bg-surface border border-surface-3/50 rounded-lg text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-slate-400">حداکثر صفحات (۱ تا ۱۰۰۰)</label>
                <input type="number" value={crawlOptions.maxPages} onChange={e => setCrawlOptions(o => ({ ...o, maxPages: parseInt(e.target.value) || 1 }))} min={1} max={1000} className="w-full mt-1 px-3 py-2 bg-surface border border-surface-3/50 rounded-lg text-sm text-white" />
              </div>
            </div>
            {crawlError && <p className="text-xs text-accent-red mb-3">{crawlError}</p>}
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setShowRunCrawl(false)} disabled={crawlLoading} className="px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-50">انصراف</button>
              <button onClick={handleStartCrawl} disabled={crawlLoading} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-50">
                {crawlLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Zap className="w-4 h-4" />}
                {crawlLoading ? 'در حال ثبت در صف…' : 'شروع خزش'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SeverityCard({ severity, count, total }: { severity: Severity; count: number; total: number }) {
  const colors: Record<Severity, string> = {
    critical: 'border-red-500/30 bg-red-500/5',
    high: 'border-orange-500/30 bg-orange-500/5',
    medium: 'border-yellow-500/30 bg-yellow-500/5',
    low: 'border-blue-500/30 bg-blue-500/5',
    notice: 'border-slate-500/30 bg-slate-500/5',
  };
  const textColors: Record<Severity, string> = {
    critical: 'text-red-400',
    high: 'text-orange-400',
    medium: 'text-yellow-400',
    low: 'text-blue-400',
    notice: 'text-slate-400',
  };
  return (
    <div className={`border rounded-xl p-4 ${colors[severity]}`}>
      <p className={`text-2xl font-bold ${textColors[severity]}`}>{count}</p>
      <p className="text-xs text-slate-400 capitalize mt-1">{severity}</p>
      {total > 0 && (
        <div className="mt-2 w-full bg-surface-3/50 rounded-full h-1">
          <div className={`h-1 rounded-full ${textColors[severity].replace('text-', 'bg-')}`} style={{ width: `${(count / total) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

function SeverityIcon({ severity }: { severity: Severity }) {
  const icons: Record<Severity, React.ReactNode> = {
    critical: <XCircle className="w-5 h-5 text-red-400" />,
    high: <AlertTriangle className="w-5 h-5 text-orange-400" />,
    medium: <AlertCircle className="w-5 h-5 text-yellow-400" />,
    low: <Clock className="w-5 h-5 text-blue-400" />,
    notice: <CheckCircle2 className="w-5 h-5 text-slate-400" />,
  };
  return <>{icons[severity]}</>;
}
