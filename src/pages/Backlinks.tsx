import {
  Link2, AlertCircle, ExternalLink, TrendingUp, TrendingDown,
  Plus, Filter, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { useAppState } from '../lib/store';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const backlinkTrend = [
  { month: 'Jan', new: 45, lost: 12, total: 3200 },
  { month: 'Feb', new: 52, lost: 8, total: 3244 },
  { month: 'Mar', new: 38, lost: 15, total: 3267 },
  { month: 'Apr', new: 61, lost: 10, total: 3318 },
  { month: 'May', new: 48, lost: 18, total: 3348 },
  { month: 'Jun', new: 55, lost: 7, total: 3396 },
];

export default function Backlinks() {
  const { state } = useAppState();
  const providerConfigured = state.providerStatus.dataForSeo === 'connected';

  if (!state.currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Link2 className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No Project Selected</h2>
        <p className="text-slate-400">Select or create a project to analyze backlinks.</p>
      </div>
    );
  }

  if (!providerConfigured) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Backlinks</h1>
          <p className="text-sm text-slate-400 mt-1">Monitor your backlink profile and discover link opportunities</p>
        </div>
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-accent-yellow mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Provider Not Configured</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
            Backlink data requires a backlink index provider (DataForSEO, Ahrefs API, etc.) to fetch real backlink data.
            No fabricated backlink data is shown.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Backlinks</h1>
          <p className="text-sm text-slate-400 mt-1">Backlink profile for <span className="text-brand-400">{state.currentProject?.domain}</span></p>
        </div>
        <button className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
          <Plus className="w-4 h-4" /> Import Backlinks
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">Total Backlinks</p>
          <p className="text-2xl font-bold text-white mt-1">3,396</p>
          <p className="text-xs text-accent-green mt-1">+55 this month</p>
        </div>
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">Referring Domains</p>
          <p className="text-2xl font-bold text-white mt-1">182</p>
          <p className="text-xs text-accent-green mt-1">+8 this month</p>
        </div>
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">New Backlinks</p>
          <p className="text-2xl font-bold text-accent-green mt-1">55</p>
          <p className="text-xs text-slate-400 mt-1">Last 30 days</p>
        </div>
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">Lost Backlinks</p>
          <p className="text-2xl font-bold text-accent-red mt-1">7</p>
          <p className="text-xs text-slate-400 mt-1">Last 30 days</p>
        </div>
      </div>

      {/* Trend Chart */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Backlink Growth</h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={backlinkTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
            <Area type="monotone" dataKey="total" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Recent Backlinks */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-3/50">
          <h3 className="text-sm font-semibold text-white">Recent Backlinks</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-3/50">
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Source</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Anchor</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Target</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-400">DR</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-400">Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              { source: 'techblog.example.com', anchor: 'best seo tools', target: '/tools', dr: 72, status: 'active' },
              { source: 'marketing-digest.io', anchor: 'rank tracking', target: '/rankings', dr: 65, status: 'active' },
              { source: 'webmaster-hub.com', anchor: 'site audit guide', target: '/blog/audit', dr: 58, status: 'active' },
              { source: 'digital-marketing.org', anchor: 'seo automation', target: '/automation', dr: 81, status: 'active' },
              { source: 'old-blog.example.net', anchor: 'click here', target: '/old-page', dr: 23, status: 'lost' },
            ].map((bl, i) => (
              <tr key={i} className="border-b border-surface-3/20 hover:bg-surface-3/20">
                <td className="px-4 py-2.5 text-xs text-white">{bl.source}</td>
                <td className="px-4 py-2.5 text-xs text-slate-300">{bl.anchor}</td>
                <td className="px-4 py-2.5 text-xs text-slate-400">{bl.target}</td>
                <td className="px-4 py-2.5 text-right text-xs text-white font-medium">{bl.dr}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${bl.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {bl.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
