import { useState } from 'react';
import {
  Bell, AlertTriangle, CheckCircle2, Info, TrendingDown,
  Link2, XCircle, Filter, Check, Trash2, Settings
} from 'lucide-react';
import { useAppState } from '../lib/store';

interface AlertItem {
  id: string;
  type: 'rank_drop' | 'critical_issue' | 'backlink_lost' | 'traffic_decline' | 'competitor_overtake' | 'system';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  project: string;
  triggeredAt: string;
  read: boolean;
}

export default function Alerts() {
  const [filter, setFilter] = useState<'all' | 'unread' | 'critical'>('all');
  const [showRuleModal, setShowRuleModal] = useState(false);

  const alerts: AlertItem[] = [
    { id: '1', type: 'rank_drop', severity: 'high', title: 'Keyword position dropped significantly', message: '"seo automation tool" dropped from position 8 to 15 (-7)', project: 'example.com', triggeredAt: '2 hours ago', read: false },
    { id: '2', type: 'critical_issue', severity: 'critical', title: 'Critical SEO issue detected', message: 'HTTPS redirect is not configured. Site is accessible over HTTP.', project: 'example.com', triggeredAt: '5 hours ago', read: false },
    { id: '3', type: 'backlink_lost', severity: 'medium', title: 'Backlink lost', message: 'Lost backlink from high-authority domain (DR 82): techblog.example.com', project: 'example.com', triggeredAt: '1 day ago', read: false },
    { id: '4', type: 'competitor_overtake', severity: 'medium', title: 'Competitor overtook your position', message: 'competitor-a.com now ranks above you for "keyword research tool"', project: 'example.com', triggeredAt: '2 days ago', read: true },
    { id: '5', type: 'traffic_decline', severity: 'high', title: 'Organic traffic declining', message: 'Organic clicks decreased by 18% compared to previous week', project: 'example.com', triggeredAt: '3 days ago', read: true },
    { id: '6', type: 'system', severity: 'low', title: 'Crawl completed successfully', message: 'Site crawl completed: 450 pages analyzed, 12 issues found', project: 'example.com', triggeredAt: '4 days ago', read: true },
  ];

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
          <button className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
            <Check className="w-4 h-4" /> Mark All Read
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
      <div className="space-y-2">
        {filteredAlerts.map(alert => (
          <div key={alert.id} className={`bg-surface-2 border rounded-xl p-4 ${alert.read ? 'border-surface-3/50' : 'border-brand-600/30 bg-brand-600/5'}`}>
            <div className="flex items-start gap-3">
              <AlertIcon type={alert.type} severity={alert.severity} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-white">{alert.title}</h4>
                  <SeverityBadge severity={alert.severity} />
                  {!alert.read && <span className="w-2 h-2 rounded-full bg-brand-500" />}
                </div>
                <p className="text-xs text-slate-400 mt-1">{alert.message}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[10px] text-slate-500">{alert.project}</span>
                  <span className="text-[10px] text-slate-500">{alert.triggeredAt}</span>
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

      {/* Alert Rules */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Active Alert Rules</h3>
        <div className="space-y-3">
          {[
            { rule: 'IF keyword position drops by more than 5 positions', channels: ['email', 'dashboard'], active: true },
            { rule: 'IF critical SEO issue is detected', channels: ['email', 'dashboard', 'slack'], active: true },
            { rule: 'IF organic clicks decrease by more than 15%', channels: ['email'], active: true },
            { rule: 'IF competitor overtakes keyword position', channels: ['dashboard'], active: false },
            { rule: 'IF backlink from DR > 50 is lost', channels: ['email', 'dashboard'], active: true },
          ].map((ruleConfig, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
              <div className="flex-1">
                <p className="text-xs text-slate-300 font-mono">{ruleConfig.rule}</p>
                <div className="flex items-center gap-2 mt-1">
                  {ruleConfig.channels.map(ch => (
                    <span key={ch} className="px-1.5 py-0.5 rounded text-[10px] bg-surface-3/50 text-slate-400">{ch}</span>
                  ))}
                </div>
              </div>
              <div className={`w-8 h-4 rounded-full cursor-pointer ${ruleConfig.active ? 'bg-accent-green' : 'bg-surface-3'}`}>
                <div className={`w-3 h-3 rounded-full bg-white mt-0.5 ${ruleConfig.active ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
              </div>
            </div>
          ))}
        </div>
      </div>

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
                  <option>New critical issue appears</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Threshold</label>
                <input type="number" defaultValue={5} className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Notification Channels</label>
                <div className="flex items-center gap-3">
                  {['Email', 'Dashboard', 'Slack', 'Webhook'].map(ch => (
                    <label key={ch} className="flex items-center gap-1.5 text-xs text-slate-300">
                      <input type="checkbox" defaultChecked={ch !== 'Webhook'} className="rounded" />
                      {ch}
                    </label>
                  ))}
                </div>
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

function AlertIcon({ type, severity }: { type: string; severity: string }) {
  if (severity === 'critical') return <XCircle className="w-5 h-5 text-accent-red flex-shrink-0" />;
  if (type === 'rank_drop') return <TrendingDown className="w-5 h-5 text-accent-yellow flex-shrink-0" />;
  if (type === 'backlink_lost') return <Link2 className="w-5 h-5 text-accent-red flex-shrink-0" />;
  if (type === 'system') return <Info className="w-5 h-5 text-slate-400 flex-shrink-0" />;
  return <AlertTriangle className="w-5 h-5 text-accent-yellow flex-shrink-0" />;
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
