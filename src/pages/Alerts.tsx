import { useState, useEffect } from 'react';
import {
  Bell, AlertTriangle, Check, Trash2, Settings, Filter,
  XCircle, Info, TrendingDown, Link2
} from 'lucide-react';
import { useAppState } from '../lib/store';
import { api } from '../lib/api';
import type { Alert as AlertType } from '../lib/types';

export default function Alerts() {
  const { state } = useAppState();
  const [alerts, setAlerts] = useState<AlertType[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'critical'>('all');
  const [showRuleModal, setShowRuleModal] = useState(false);

  useEffect(() => {
    async function loadAlerts() {
      if (!state.currentProject) {
        setLoading(false);
        return;
      }

      try {
        const data = await api.getAlerts(state.currentProject.id);
        setAlerts(data);
      } catch (error) {
        console.error('Failed to load alerts:', error);
      } finally {
        setLoading(false);
      }
    }

    loadAlerts();
  }, [state.currentProject]);

  if (!state.currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Bell className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No Project Selected</h2>
        <p className="text-slate-400">Select or create a project to view alerts.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading alerts...</p>
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Alerts</h1>
          <p className="text-sm text-slate-400 mt-1">SEO alerts and notifications</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowRuleModal(true)} className="px-4 py-2 bg-surface-3/50 hover:bg-surface-3 text-slate-300 text-sm font-medium rounded-lg flex items-center gap-2">
            <Settings className="w-4 h-4" /> Alert Rules
          </button>
        </div>
      </div>

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
            {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : 'Critical & High'}
          </button>
        ))}
        <span className="text-xs text-slate-500 ml-auto">{filteredAlerts.length} alerts</span>
      </div>

      {/* Alert List */}
      {filteredAlerts.length === 0 ? (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-12 text-center">
          <Bell className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No Alerts</h3>
          <p className="text-sm text-slate-400">You're all caught up! No alerts to display.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredAlerts.map(alert => (
            <div key={alert.id} className={`bg-surface-2 border rounded-xl p-4 ${alert.read ? 'border-surface-3/50' : 'border-brand-600/30 bg-brand-600/5'}`}>
              <div className="flex items-start gap-3">
                <AlertIcon severity={alert.severity} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-white">{alert.message}</h4>
                    <SeverityBadge severity={alert.severity} />
                    {!alert.read && <span className="w-2 h-2 rounded-full bg-brand-500" />}
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10px] text-slate-500">{alert.rule}</span>
                    <span className="text-[10px] text-slate-500">{new Date(alert.triggeredAt).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!alert.read && (
                    <button className="p-1.5 rounded hover:bg-surface-3/50 text-slate-400 hover:text-white" title="Mark as read">
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
            <h2 className="text-lg font-bold text-white mb-4">Create Alert Rule</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Condition</label>
                <select className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white">
                  <option>Keyword position drops by more than X positions</option>
                  <option>Organic clicks decrease by more than X%</option>
                  <option>Critical SEO issue detected</option>
                  <option>Competitor overtakes keyword</option>
                  <option>Backlink from high-DR domain lost</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Threshold</label>
                <input type="number" defaultValue={5} className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowRuleModal(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
              <button onClick={() => setShowRuleModal(false)} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg">Create Rule</button>
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
