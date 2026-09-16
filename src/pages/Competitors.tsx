import { useState } from 'react';
import {
  Target, Plus, AlertCircle, ExternalLink, BarChart3,
  TrendingUp, TrendingDown, ArrowRight, Globe
} from 'lucide-react';
import { useAppState } from '../lib/store';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

const competitorData = [
  { metric: 'Keywords', you: 1247, comp1: 2340, comp2: 1890, comp3: 980 },
  { metric: 'Top 10', you: 62, comp1: 145, comp2: 98, comp3: 42 },
  { metric: 'Backlinks', you: 3400, comp1: 12000, comp2: 8500, comp3: 2100 },
  { metric: 'Domains', you: 180, comp1: 620, comp2: 430, comp3: 95 },
  { metric: 'Traffic', you: 8500, comp1: 24000, comp2: 15000, comp3: 5200 },
];

const radarData = [
  { subject: 'Keywords', you: 65, competitor: 90 },
  { subject: 'Content', you: 58, competitor: 75 },
  { subject: 'Backlinks', you: 42, competitor: 85 },
  { subject: 'Technical', you: 72, competitor: 68 },
  { subject: 'Performance', you: 81, competitor: 74 },
  { subject: 'Schema', you: 43, competitor: 60 },
];

export default function Competitors() {
  const { state } = useAppState();
  const [showAddModal, setShowAddModal] = useState(false);
  const providerConfigured = state.providerStatus.dataForSeo === 'connected';

  if (!state.currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Target className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No Project Selected</h2>
        <p className="text-slate-400">Select or create a project to analyze competitors.</p>
      </div>
    );
  }

  if (!providerConfigured) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Competitor Analysis</h1>
          <p className="text-sm text-slate-400 mt-1">Compare your SEO performance against competitors</p>
        </div>
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-accent-yellow mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Provider Not Configured</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
            Competitor analysis requires a SERP data provider to fetch real competitive intelligence data.
          </p>
          <div className="bg-surface/50 rounded-lg p-4 max-w-sm mx-auto text-left">
            <p className="text-xs text-slate-400">Required: DataForSEO or equivalent SERP provider credentials</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Competitor Analysis</h1>
          <p className="text-sm text-slate-400 mt-1">Competitive intelligence for <span className="text-brand-400">{state.currentProject?.domain}</span></p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Competitor
        </button>
      </div>

      {/* Competitor Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { domain: 'competitor-a.com', keywords: 2340, top10: 145, backlinks: 12000, visibility: 89 },
          { domain: 'competitor-b.com', keywords: 1890, top10: 98, backlinks: 8500, visibility: 75 },
          { domain: 'competitor-c.com', keywords: 980, top10: 42, backlinks: 2100, visibility: 52 },
        ].map((comp, i) => (
          <div key={i} className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-accent-purple/20 flex items-center justify-center">
                <Globe className="w-4 h-4 text-accent-purple" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{comp.domain}</p>
                <p className="text-xs text-slate-400">Visibility: {comp.visibility}%</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-surface/50 rounded-lg p-2 text-center">
                <p className="text-xs text-slate-400">Keywords</p>
                <p className="text-sm font-bold text-white">{comp.keywords.toLocaleString()}</p>
              </div>
              <div className="bg-surface/50 rounded-lg p-2 text-center">
                <p className="text-xs text-slate-400">Top 10</p>
                <p className="text-sm font-bold text-brand-400">{comp.top10}</p>
              </div>
              <div className="bg-surface/50 rounded-lg p-2 text-center">
                <p className="text-xs text-slate-400">Backlinks</p>
                <p className="text-sm font-bold text-white">{(comp.backlinks / 1000).toFixed(1)}K</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Comparison Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Keyword Comparison</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={competitorData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="metric" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
              <Bar dataKey="you" fill="#3b82f6" name="You" />
              <Bar dataKey="comp1" fill="#8b5cf6" name="Competitor A" />
              <Bar dataKey="comp2" fill="#f59e0b" name="Competitor B" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">SEO Strength Comparison</h3>
          <ResponsiveContainer width="100%" height={250}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#334155" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <PolarRadiusAxis tick={{ fontSize: 10, fill: '#64748b' }} />
              <Radar name="You" dataKey="you" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
              <Radar name="Top Competitor" dataKey="competitor" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Keyword Gap */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Keyword Gap — Competitors Rank, You Don't</h3>
        <div className="space-y-2">
          {[
            { keyword: 'free seo tools', competitors: ['competitor-a.com', 'competitor-b.com'], volume: 12000 },
            { keyword: 'seo course', competitors: ['competitor-a.com'], volume: 8500 },
            { keyword: 'google ranking factors', competitors: ['competitor-a.com', 'competitor-c.com'], volume: 6200 },
            { keyword: 'seo agency', competitors: ['competitor-b.com', 'competitor-c.com'], volume: 4800 },
          ].map((gap, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-surface/50 hover:bg-surface-3/30">
              <div>
                <p className="text-sm text-white font-medium">{gap.keyword}</p>
                <p className="text-xs text-slate-400">Vol: {gap.volume.toLocaleString()} · Ranks: {gap.competitors.join(', ')}</p>
              </div>
              <button className="px-3 py-1.5 bg-brand-600/20 text-brand-400 text-xs rounded-lg hover:bg-brand-600/30">
                Add to Tracking
              </button>
            </div>
          ))}
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface-2 border border-surface-3/50 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Add Competitor</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Competitor Domain</label>
                <input type="text" placeholder="competitor.com" className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50" />
              </div>
              <p className="text-xs text-slate-400">Auto-discovery will also suggest competitors based on keyword overlap.</p>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
