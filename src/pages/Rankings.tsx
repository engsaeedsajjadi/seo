import { useState } from 'react';
import {
  BarChart3, TrendingUp, TrendingDown, Minus, Calendar,
  Globe, Monitor, Smartphone, AlertCircle, ExternalLink
} from 'lucide-react';
import { useAppState } from '../lib/store';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

const rankingHistory = [
  { date: 'Week 1', position: 28 },
  { date: 'Week 2', position: 25 },
  { date: 'Week 3', position: 22 },
  { date: 'Week 4', position: 19 },
  { date: 'Week 5', position: 17 },
  { date: 'Week 6', position: 14 },
  { date: 'Week 7', position: 14 },
  { date: 'Week 8', position: 12 },
];

const visibilityTrend = [
  { date: 'Jan', top3: 12, top10: 45, top20: 89, top50: 156 },
  { date: 'Feb', top3: 14, top10: 48, top20: 92, top50: 160 },
  { date: 'Mar', top3: 15, top10: 52, top20: 98, top50: 168 },
  { date: 'Apr', top3: 18, top10: 55, top20: 102, top50: 172 },
  { date: 'May', top3: 21, top10: 58, top20: 108, top50: 180 },
  { date: 'Jun', top3: 24, top10: 62, top20: 115, top50: 188 },
];

export default function Rankings() {
  const { state } = useAppState();
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [engine, setEngine] = useState('google');

  const hasProject = state.currentProject !== null;
  const providerConfigured = state.providerStatus.dataForSeo === 'connected';

  if (!hasProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <BarChart3 className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No Project Selected</h2>
        <p className="text-slate-400">Select or create a project to track rankings.</p>
      </div>
    );
  }

  if (!providerConfigured) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Rank Tracking</h1>
          <p className="text-sm text-slate-400 mt-1">Monitor your search engine positions over time</p>
        </div>
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-accent-yellow mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Rank Tracking Not Available</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
            Rank tracking requires a SERP data provider to query actual search engine results.
            Positions are fetched in real-time from the configured provider.
          </p>
          <div className="bg-surface/50 rounded-lg p-4 max-w-sm mx-auto text-left">
            <p className="text-xs font-semibold text-slate-300 mb-2">Required Configuration:</p>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>• DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD</li>
              <li>• Or SERP API provider credentials</li>
              <li>• Keywords must be added to the project</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Rank Tracking</h1>
          <p className="text-sm text-slate-400 mt-1">
            Position tracking for <span className="text-brand-400">{state.currentProject?.domain}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-surface-2 border border-surface-3/50 rounded-lg overflow-hidden">
            <button
              onClick={() => setDevice('desktop')}
              className={`px-3 py-1.5 text-xs flex items-center gap-1 ${device === 'desktop' ? 'bg-brand-600/20 text-brand-400' : 'text-slate-400 hover:text-white'}`}
            >
              <Monitor className="w-3 h-3" /> Desktop
            </button>
            <button
              onClick={() => setDevice('mobile')}
              className={`px-3 py-1.5 text-xs flex items-center gap-1 ${device === 'mobile' ? 'bg-brand-600/20 text-brand-400' : 'text-slate-400 hover:text-white'}`}
            >
              <Smartphone className="w-3 h-3" /> Mobile
            </button>
          </div>
          <button className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg">
            Check Now
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">Top 3</p>
          <p className="text-2xl font-bold text-accent-green mt-1">24</p>
          <p className="text-xs text-accent-green mt-1">+3 this week</p>
        </div>
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">Top 10</p>
          <p className="text-2xl font-bold text-brand-400 mt-1">62</p>
          <p className="text-xs text-accent-green mt-1">+4 this week</p>
        </div>
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">Top 20</p>
          <p className="text-2xl font-bold text-accent-yellow mt-1">115</p>
          <p className="text-xs text-accent-green mt-1">+7 this week</p>
        </div>
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">Avg. Position</p>
          <p className="text-2xl font-bold text-white mt-1">14.3</p>
          <p className="text-xs text-accent-green mt-1">-2.1 improved</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Keyword Distribution Over Time</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={visibilityTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
              <Area type="monotone" dataKey="top3" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
              <Area type="monotone" dataKey="top10" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
              <Area type="monotone" dataKey="top20" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} />
              <Area type="monotone" dataKey="top50" stackId="1" stroke="#64748b" fill="#64748b" fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Average Position Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={rankingHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis reversed tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
              <Line type="monotone" dataKey="position" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Rankings Table */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-3/50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Keyword Positions</h3>
          <span className="text-xs text-slate-400">
            <Calendar className="w-3 h-3 inline mr-1" />
            Last checked: 2 hours ago
          </span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-3/50">
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Keyword</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Position</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Change</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">URL</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Best</th>
            </tr>
          </thead>
          <tbody>
            {[
              { keyword: 'rank tracker software', position: 5, change: 1, url: '/rank-tracker', best: 3 },
              { keyword: 'seo automation', position: 8, change: -2, url: '/automation', best: 6 },
              { keyword: 'keyword research tool', position: 12, change: 4, url: '/keywords', best: 10 },
              { keyword: 'site audit tool', position: 14, change: 3, url: '/audit', best: 11 },
              { keyword: 'backlink checker', position: 23, change: -8, url: '/backlinks', best: 15 },
              { keyword: 'seo reporting', position: 31, change: 5, url: '/reports', best: 28 },
              { keyword: 'competitor analysis', position: 7, change: 2, url: '/competitors', best: 5 },
              { keyword: 'technical seo audit', position: 19, change: -1, url: '/technical-seo', best: 16 },
            ].map((row, i) => (
              <tr key={i} className="border-b border-surface-3/20 hover:bg-surface-3/20">
                <td className="px-4 py-3 text-sm text-white font-medium">{row.keyword}</td>
                <td className="px-4 py-3 text-right">
                  <span className={`text-sm font-bold ${row.position <= 3 ? 'text-accent-green' : row.position <= 10 ? 'text-brand-400' : row.position <= 20 ? 'text-accent-yellow' : 'text-slate-300'}`}>
                    {row.position}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {row.change > 0 ? (
                    <span className="text-xs text-accent-green flex items-center justify-end gap-0.5"><TrendingUp className="w-3 h-3" />+{row.change}</span>
                  ) : row.change < 0 ? (
                    <span className="text-xs text-accent-red flex items-center justify-end gap-0.5"><TrendingDown className="w-3 h-3" />{row.change}</span>
                  ) : (
                    <Minus className="w-3 h-3 text-slate-500 ml-auto" />
                  )}
                </td>
                <td className="px-4 py-3 text-right text-xs text-slate-400">{row.url}</td>
                <td className="px-4 py-3 text-right text-xs text-slate-300">{row.best}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
