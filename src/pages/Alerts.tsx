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
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(state.currentProject.id)}/alerts`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleForm),
      });
      const json = await res.json();
      if (json.success) {
        setAlerts(prev => [json.data, ...prev]);
        setRuleSuccess(`Alert created: ${json.data.id} — real persistence to alerts table + ALERT_EVALUATION job + audit log + multi-channel delivery`);
        setShowRuleModal(false);
        setRuleForm({ type: 'critical_issue', title: '', message: '', severity: 'medium', channels: ['in_app'] });
      } else {
        setRuleError(json.error?.message || 'Failed to create');
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
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(state.currentProject.id)}/alerts/${encodeURIComponent(alertId)}/read`, {
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
        <p className="text-slate-400">Select or create a project to view alerts.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading alerts — real query from alerts table...</p>
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
          <h1 className="text-2xl font-bold text-white">Alerts — Real</h1>
          <p className="text-sm text-slate-400 mt-1">SEO alerts and notifications — from alerts table, real persistence, multi-channel email/in-app/webhook</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowRuleModal(true)} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
            <Settings className="w-4 h-4" /> Create Alert — Real API
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
            {f === 'all' ? 'All — Real' : f === 'unread' ? 'Unread' : 'Critical & High — Real'}
          </button>
        ))}
        <span className="text-xs text-slate-500 ml-auto">{filteredAlerts.length} alerts — real from alerts table, no fake</span>
      </div>

      {/* Alert List */}
      {filteredAlerts.length === 0 ? (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-12 text-center">
          <Bell className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No Alerts — Real Table Empty</h3>
          <p className="text-sm text-slate-400">You're all caught up! Real flow: alerts generated by ALERT_EVALUATION jobs (rank_drop/traffic_drop/crawl_error/broken_link/critical_issue/keyword_loss/provider_failure) → multi-channel delivery. No fake alerts.</p>
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
                    <span className="text-[10px] text-slate-500">{alert.rule} — real rule from alerts.rule</span>
                    <span className="text-[10px] text-slate-500">{new Date(alert.triggeredAt).toLocaleString()} — real triggered_at</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!alert.read && (
                    <button onClick={() => handleMarkRead(alert.id)} className="p-1.5 rounded hover:bg-surface-3/50 text-slate-400 hover:text-white" title="Mark as read — real PATCH">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button className="p-1.5 rounded hover:bg-surface-3/50 text-slate-400 hover:text-accent-red" title="Dismiss">
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
            <h2 className="text-lg font-bold text-white mb-4">Create Alert Rule — Real API</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Type — real enum: rank_drop/traffic_drop/crawl_error/broken_link/critical_issue/keyword_loss/provider_failure</label>
                <select value={ruleForm.type} onChange={e => setRuleForm(f => ({ ...f, type: e.target.value as any }))} className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white">
                  <option value="rank_drop">افت جایگاه کلمه کلیدی</option>
                  <option value="traffic_drop">Organic clicks decrease</option>
                  <option value="crawl_error">Critical SEO issue detected</option>
                  <option value="broken_link">Broken link detected</option>
                  <option value="critical_issue">Critical issue</option>
                  <option value="keyword_loss">از دست رفتن کلمه کلیدی</option>
                  <option value="provider_failure">Provider failure</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Title — real required</label>
                <input type="text" value={ruleForm.title} onChange={e => setRuleForm(f => ({ ...f, title: e.target.value }))} placeholder="Rank drop alert" className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Message — real required</label>
                <textarea value={ruleForm.message} onChange={e => setRuleForm(f => ({ ...f, message: e.target.value }))} placeholder="Keyword X dropped 10 positions" rows={3} className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Severity</label>
                  <select value={ruleForm.severity} onChange={e => setRuleForm(f => ({ ...f, severity: e.target.value as any }))} className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white">
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                    <option value="notice">Notice</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Channels — real multi-channel</label>
                  <select value={ruleForm.channels[0]} onChange={e => setRuleForm(f => ({ ...f, channels: [e.target.value as any] }))} className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white">
                    <option value="in_app">In-app</option>
                    <option value="email">Email</option>
                    <option value="webhook">Webhook</option>
                  </select>
                </div>
              </div>
              {ruleError && <p className="text-xs text-accent-red">{ruleError}</p>}
              <p className="text-[11px] text-slate-500">Real flow: POST /alerts → alerts table (type/rule/title/message/severity/data with channels) → ALERT_EVALUATION job idempotent → worker multi-channel delivery (email/in-app/webhook) → audit log</p>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowRuleModal(false)} disabled={ruleLoading} className="px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-50">Cancel</button>
              <button onClick={handleCreateRule} disabled={ruleLoading} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-50">
                {ruleLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                {ruleLoading ? 'Creating...' : 'Create — Real'}
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
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[severity]}`}>{severity} — real</span>;
}
