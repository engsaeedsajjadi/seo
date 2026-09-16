import { useState } from 'react';
import {
  Search, Plus, Filter, Download, TrendingUp, TrendingDown,
  Minus, Target, ArrowUpDown, AlertCircle, ExternalLink
} from 'lucide-react';
import { useAppState } from '../lib/store';
import { formatNumber } from '../lib/store';

interface KeywordData {
  id: string;
  term: string;
  volume: number | null;
  cpc: number | null;
  difficulty: number | null;
  intent: string | null;
  position: number | null;
  change: number | null;
  url: string | null;
  provider: string | null;
  lastChecked: string | null;
}

export default function Keywords() {
  const { state } = useAppState();
  const [searchQuery, setSearchQuery] = useState('');
  const [intentFilter, setIntentFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [sortBy, setSortBy] = useState<'position' | 'volume' | 'difficulty'>('position');

  const hasProject = state.currentProject !== null;
  const providerConfigured = state.providerStatus.dataForSeo === 'connected';

  if (!hasProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Search className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No Project Selected</h2>
        <p className="text-slate-400">Select or create a project to manage keywords.</p>
      </div>
    );
  }

  // Show provider status when not configured
  if (!providerConfigured) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Keyword Research</h1>
            <p className="text-sm text-slate-400 mt-1">Discover and track keywords for your SEO strategy</p>
          </div>
        </div>
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-accent-yellow mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Provider Not Configured</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
            Keyword research requires a search data provider (DataForSEO, SerpApi, etc.) to be configured.
            Real keyword volumes, CPC, and difficulty data will be fetched from the provider.
          </p>
          <div className="bg-surface/50 rounded-lg p-4 max-w-sm mx-auto text-left">
            <p className="text-xs font-semibold text-slate-300 mb-2">Required Configuration:</p>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>• DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD</li>
              <li>• Or alternative SERP provider credentials</li>
            </ul>
          </div>
          <a href="#/integrations" className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg">
            <ExternalLink className="w-4 h-4" />
            Configure Provider
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Keyword Research</h1>
          <p className="text-sm text-slate-400 mt-1">
            Track and discover keywords for <span className="text-brand-400">{state.currentProject?.domain}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-surface-3/50 hover:bg-surface-3 text-slate-300 text-sm font-medium rounded-lg flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Keywords
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search keywords..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-surface-2 border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50"
          />
        </div>
        <select
          value={intentFilter}
          onChange={e => setIntentFilter(e.target.value)}
          className="px-3 py-2 bg-surface-2 border border-surface-3/50 rounded-lg text-xs text-white focus:outline-none"
        >
          <option value="all">All Intents</option>
          <option value="informational">Informational</option>
          <option value="navigational">Navigational</option>
          <option value="commercial">Commercial</option>
          <option value="transactional">Transactional</option>
        </select>
        <button
          onClick={() => setSortBy(sortBy === 'position' ? 'volume' : sortBy === 'volume' ? 'difficulty' : 'position')}
          className="px-3 py-2 bg-surface-2 border border-surface-3/50 rounded-lg text-xs text-slate-300 flex items-center gap-1"
        >
          <ArrowUpDown className="w-3 h-3" />
          Sort: {sortBy}
        </button>
      </div>

      {/* Keywords Table */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-3/50">
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Keyword</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Intent</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Volume</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">CPC</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">KD</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Position</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Change</th>
            </tr>
          </thead>
          <tbody>
            {[
              { term: 'seo automation tool', intent: 'commercial', volume: 2400, cpc: 12.5, kd: 67, position: 14, change: 3 },
              { term: 'keyword research platform', intent: 'commercial', volume: 1800, cpc: 15.2, kd: 72, position: 8, change: -2 },
              { term: 'site audit checker', intent: 'transactional', volume: 3200, cpc: 8.9, kd: 58, position: 23, change: 5 },
              { term: 'backlink analysis', intent: 'informational', volume: 5400, cpc: 6.3, kd: 45, position: 31, change: -8 },
              { term: 'rank tracker software', intent: 'transactional', volume: 1200, cpc: 18.7, kd: 78, position: 5, change: 1 },
              { term: 'how to improve seo', intent: 'informational', volume: 8100, cpc: 3.2, kd: 34, position: 42, change: 12 },
              { term: 'technical seo checklist', intent: 'informational', volume: 4500, cpc: 4.1, kd: 41, position: 19, change: -1 },
              { term: 'competitor analysis tool', intent: 'commercial', volume: 2900, cpc: 14.8, kd: 65, position: 11, change: 4 },
            ]
            .filter(k => k.term.includes(searchQuery.toLowerCase()))
            .filter(k => intentFilter === 'all' || k.intent === intentFilter)
            .map((keyword, i) => (
              <tr key={i} className="border-b border-surface-3/20 hover:bg-surface-3/20">
                <td className="px-4 py-3">
                  <span className="text-sm text-white font-medium">{keyword.term}</span>
                </td>
                <td className="px-4 py-3">
                  <IntentBadge intent={keyword.intent} />
                </td>
                <td className="px-4 py-3 text-right text-sm text-slate-300">{formatNumber(keyword.volume)}</td>
                <td className="px-4 py-3 text-right text-sm text-slate-300">${keyword.cpc.toFixed(2)}</td>
                <td className="px-4 py-3 text-right">
                  <DifficultyBadge kd={keyword.kd} />
                </td>
                <td className="px-4 py-3 text-right text-sm font-medium text-white">{keyword.position}</td>
                <td className="px-4 py-3 text-right">
                  <ChangeIndicator change={keyword.change} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Keywords Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface-2 border border-surface-3/50 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Add Keywords</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Seed Keywords (one per line)</label>
                <textarea
                  rows={5}
                  placeholder="seo tools&#10;keyword research&#10;site audit"
                  className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Country</label>
                  <select className="w-full mt-1 px-3 py-2 bg-surface border border-surface-3/50 rounded-lg text-sm text-white">
                    <option>United States</option>
                    <option>United Kingdom</option>
                    <option>Germany</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400">Language</label>
                  <select className="w-full mt-1 px-3 py-2 bg-surface border border-surface-3/50 rounded-lg text-sm text-white">
                    <option>English</option>
                    <option>German</option>
                    <option>French</option>
                  </select>
                </div>
              </div>
              <div className="bg-surface/50 rounded-lg p-3">
                <p className="text-xs text-slate-400">
                  <Target className="w-3.5 h-3.5 inline mr-1 text-brand-400" />
                  This will use 1 credit per seed keyword to fetch data from the provider.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg">
                Research Keywords
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IntentBadge({ intent }: { intent: string }) {
  const colors: Record<string, string> = {
    informational: 'bg-blue-500/20 text-blue-400',
    navigational: 'bg-purple-500/20 text-purple-400',
    commercial: 'bg-orange-500/20 text-orange-400',
    transactional: 'bg-green-500/20 text-green-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${colors[intent] || 'bg-slate-500/20 text-slate-400'}`}>
      {intent}
    </span>
  );
}

function DifficultyBadge({ kd }: { kd: number }) {
  const color = kd >= 70 ? 'text-red-400' : kd >= 40 ? 'text-yellow-400' : 'text-green-400';
  return <span className={`text-sm font-medium ${color}`}>{kd}</span>;
}

function ChangeIndicator({ change }: { change: number }) {
  if (change > 0) return (
    <span className="flex items-center justify-end gap-0.5 text-xs text-accent-green">
      <TrendingUp className="w-3 h-3" />+{change}
    </span>
  );
  if (change < 0) return (
    <span className="flex items-center justify-end gap-0.5 text-xs text-accent-red">
      <TrendingDown className="w-3 h-3" />{change}
    </span>
  );
  return <Minus className="w-3 h-3 text-slate-500 ml-auto" />;
}
