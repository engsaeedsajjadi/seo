import { authenticatedFetch } from '../lib/api';
import { useState, useEffect } from 'react';
import {
  Bell, AlertTriangle, Check, Trash2, Settings, Filter,
  XCircle, Info, RefreshCw
} from 'lucide-react';
import { useAppState } from '../lib/store';
import { api } from '../lib/api';
import type { Alert as AlertType } from '../lib/types';
import { t } from '../i18n';
import { toPersianDigits, formatPersianDate, formatPersianNumber, formatCurrency, formatRelativePersianTime } from '../lib/persian';

export default function Alerts() {
  const { state } = useAppState();
  const [alerts, setAlerts] = useState<AlertType[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'critical'>('all');
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [ruleForm, setRuleForm] = useState({ type: 'critical_issue' as any, title: '', message: '', severity: 'medium' as any, channels: ['in_app'] as any[] });
  const [ruleLoading, setRuleLoading] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [ruleSuccess, setRuleSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadAlerts() {
      if (!state.currentProject) {
        setLoading(false);
        return;
      }

      try {
        const result = await api.getAlerts(state.currentProject.id);
        if (result.success) setAlerts(result.data);
      } catch (error) {
        console.error('Failed to load alerts:', error);
      } finally {
        setLoading(false);
      }
    }

    loadAlerts();
  }, [state.currentProject]);

  async function handleCreateRule() {
    if (!state.currentProject) return;
    if (!ruleForm.title.trim() || !ruleForm.message.trim()) {
      setRuleError('Title and message required');
      return;
    }
    setRuleLoading(true);
    setRuleError(null);
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(state.currentProject.id)}/alerts`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleForm),
      });
      const json = await res.json();
      if (json.success) {
        setAlerts(prev => [json.data, ...prev]);
        setRuleSuccess('هشدار ایجاد شد.');
        setShowRuleModal(false);
        setRuleForm({ type: 'critical_issue', title: '', message: '', severity: 'medium', channels: ['in_app'] });
      } else {
        setRuleError(json.error?.message || 'ایجاد انجام نشد');
      }
    } catch (e) {
      setRuleError(e instanceof Error ? e.message : String(e));
    } finally {
      setRuleLoading(false);
    }
  }

  async function handleMarkRead(alertId: string) {
    if (!state.currentProject) return;
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(state.currentProject.id)}/alerts/${encodeURIComponent(alertId)}/read`, {
        method: 'PATCH',
        credentials: 'include',
      });
      const json = await res.json();
      if (json.success) {
        setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, read: true } : a));
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (!state.currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center" dir="rtl">
        <Bell className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">پروژه‌ای انتخاب نشده</h2>
        <p className="text-slate-400">برای مشاهدهٔ هشدارها یک پروژه انتخاب یا ایجاد کنید.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">در حال بارگذاری هشدارها…</p>
        </div>
      </div>
    );
  }

  const filteredAlerts = alerts.filter(a => {
    if (filter === 'unread') return !a.read;
    if (filter === 'critical') return a.severity === 'critical' || a.severity === 'high';
    return true;
  });

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">هشدارها</h1>
          <p className="text-sm text-slate-400 mt-1">هشدارها و اعلان‌های سئوی پروژه</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowRuleModal(true)} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
            <Settings className="w-4 h-4" /> ایجاد هشدار
          </button>
        </div>
      </div>

      {ruleSuccess && (
        <div className="bg-accent-green/20 border border-accent-green/30 rounded-xl p-4 text-sm text-accent-green">{ruleSuccess}</div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-slate-400" />
        {(['all', 'unread', 'critical'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              filter === f ? 'bg-brand-600/20 text-brand-400' : 'bg-surface-3/30 text-slate-400 hover:text-white'
            }`}
          >
            {f === 'all' ? 'همه' : f === 'unread' ? 'خوانده‌نشده' : 'بحرانی و زیاد'}
          </button>
        ))}
        <span className="text-xs text-slate-500 ml-auto">{filteredAlerts.length} هشدار</span>
      </div>

      {/* Alert List */}
      {filteredAlerts.length === 0 ? (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-12 text-center">
          <Bell className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">هشداری وجود ندارد</h3>
          <p className="text-sm text-slate-400">همه‌چیز مرتب است. هشدارهای جدید اینجا نمایش داده می‌شوند.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredAlerts.map(alert => (
            <div key={alert.id} className={`bg-surface-2 border rounded-xl p-4 ${alert.read ? 'border-surface-3/50' : 'border-brand-600/30 bg-brand-600/5'}`}>
              <div className="flex items-start gap-3">
                <AlertIcon severity={alert.severity} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-white">{alert.title || alert.message}</h4>
                    <SeverityBadge severity={alert.severity} />
                    {!alert.read && <span className="w-2 h-2 rounded-full bg-brand-500" />}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{alert.message}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10px] text-slate-500">{alert.rule}</span>
                    <span className="text-[10px] text-slate-500">{new Date(alert.triggeredAt).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!alert.read && (
                    <button onClick={() => handleMarkRead(alert.id)} className="p-1.5 rounded hover:bg-surface-3/50 text-slate-400 hover:text-white" title="علامت‌گذاری به‌عنوان خوانده‌شده">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button disabled className="p-1.5 rounded hover:bg-surface-3/50 text-slate-400 hover:text-accent-red" title="بستن">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface-2 border border-surface-3/50 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">ایجاد هشدار</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">نوع هشدار</label>
                <select value={ruleForm.type} onChange={e => setRuleForm(f => ({ ...f, type: e.target.value as any }))} className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white">
                  <option value="rank_drop">افت جایگاه کلمه کلیدی</option>
                  <option value="traffic_drop">کاهش کلیک‌های ارگانیک</option>
                  <option value="crawl_error">یک مشکل بحرانی سئو پیدا شد</option>
                  <option value="broken_link">لینک شکسته پیدا شد</option>
                  <option value="critical_issue">مشکل بحرانی</option>
                  <option value="keyword_loss">از دست رفتن کلمه کلیدی</option>
                  <option value="provider_failure">خطای سرویس‌دهنده</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">عنوان</label>
                <input type="text" value={ruleForm.title} onChange={e => setRuleForm(f => ({ ...f, title: e.target.value }))} placeholder="هشدار افت رتبه" className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">متن هشدار</label>
                <textarea value={ruleForm.message} onChange={e => setRuleForm(f => ({ ...f, message: e.target.value }))} placeholder="کلمهٔ کلیدی ۱۰ رتبه افت کرد" rows={3} className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">شدت</label>
                  <select value={ruleForm.severity} onChange={e => setRuleForm(f => ({ ...f, severity: e.target.value as any }))} className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white">
                    <option value="critical">بحرانی</option>
                    <option value="high">زیاد</option>
                    <option value="medium">متوسط</option>
                    <option value="low">کم</option>
                    <option value="notice">اطلاع</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">کانال‌ها</label>
                  <select value={ruleForm.channels[0]} onChange={e => setRuleForm(f => ({ ...f, channels: [e.target.value as any] }))} className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white">
                    <option value="in_app">درون برنامه</option>
                    <option value="email">ایمیل</option>
                    <option value="webhook">وب‌هوک</option>
                  </select>
                </div>
              </div>
              {ruleError && <p className="text-xs text-accent-red">{ruleError}</p>}
              <p className="text-[11px] text-slate-500">فعلاً هشدارها فقط درون برنامه نمایش داده می‌شوند.</p>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowRuleModal(false)} disabled={ruleLoading} className="px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-50">انصراف</button>
              <button onClick={handleCreateRule} disabled={ruleLoading} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-50">
                {ruleLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                {ruleLoading ? 'در حال ایجاد…' : 'ایجاد'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AlertIcon({ severity }: { severity: string }) {
  if (severity === 'critical') return <XCircle className="w-5 h-5 text-accent-red flex-shrink-0" />;
  if (severity === 'high') return <AlertTriangle className="w-5 h-5 text-accent-yellow flex-shrink-0" />;
  if (severity === 'medium') return <AlertTriangle className="w-5 h-5 text-accent-yellow flex-shrink-0" />;
  return <Info className="w-5 h-5 text-slate-400 flex-shrink-0" />;
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-500/20 text-red-400',
    high: 'bg-orange-500/20 text-orange-400',
    medium: 'bg-yellow-500/20 text-yellow-400',
    low: 'bg-blue-500/20 text-blue-400',
  };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[severity]}`}>{severity}</span>;
}
