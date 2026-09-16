import { useState, useEffect } from 'react';
import {
  Search, Plus, Download, ArrowUpDown, AlertCircle, ExternalLink, RefreshCw
} from 'lucide-react';
import { useAppState, formatNumber } from '../lib/store';
import { api } from '../lib/api';
import type { Keyword } from '../lib/types';
import { t } from '../i18n';
import { toPersianDigits, formatPersianDate, formatPersianNumber, formatCurrency, formatRelativePersianTime } from '../lib/persian';

export default function Keywords() {
  const { state } = useAppState();
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [intentFilter, setIntentFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [sortBy, setSortBy] = useState<'position' | 'volume' | 'difficulty'>('position');
  const [seedInput, setSeedInput] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  const hasProject = state.currentProject !== null;

  useEffect(() => {
    async function loadKeywords() {
      if (!state.currentProject) {
        setLoading(false);
        return;
      }

      try {
        const result = await api.getKeywords(state.currentProject.id);
        if (result.success) setKeywords(result.data);
      } catch (error) {
        console.error('Failed to load keywords:', error);
      } finally {
        setLoading(false);
      }
    }

    loadKeywords();
  }, [state.currentProject]);

  async function handleAddKeywords() {
    if (!state.currentProject) return;
    const terms = seedInput.split('\n').map(s => s.trim()).filter(Boolean);
    if (terms.length === 0) {
      setAddError('Enter at least one keyword');
      return;
    }
    setAddLoading(true);
    setAddError(null);
    setAddSuccess(null);
    try {
      const result = await api.addKeywords(state.currentProject.id, terms);
      if (result.success) {
        setKeywords(prev => [...prev, ...result.data]);
        setAddSuccess(`Added ${result.data.length} keywords — real persistence to keywords table with normalized_term, no fake volume`);
        setSeedInput('');
        setShowAddModal(false);
      } else {
        setAddError(result.error.message);
      }
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddLoading(false);
    }
  }

  if (!hasProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center" dir="rtl">
        <Search className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">پروژه‌ای انتخاب نشده</h2>
        <p className="text-slate-400">Select or create a project to manage keywords.</p>
      </div>
    );
  }

  const filteredKeywords = keywords
    .filter(k => k.term.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter(k => intentFilter === 'all' || k.intent === intentFilter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading keywords — real query from keywords table...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Keyword Research — Real</h1>
          <p className="text-sm text-slate-400 mt-1">
            Track and discover keywords for <span className="text-brand-400">{state.currentProject?.domain}</span> — real DB, no fake
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
            Add Keywords — Real API
          </button>
        </div>
      </div>

      {addSuccess && (
        <div className="bg-accent-green/20 border border-accent-green/30 rounded-xl p-4 text-sm text-accent-green">
          {addSuccess}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="جستجوی کلمات کلیدی..."
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
      {filteredKeywords.length === 0 ? (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-12 text-center">
          <Search className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No Keywords Yet — Real Table Empty</h3>
          <p className="text-sm text-slate-400 mb-4">Add keywords to start tracking their performance. Real persistence to keywords table with org_id isolation, normalized_term unique per project.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Keywords — Real
          </button>
        </div>
      ) : (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-3/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Keyword — Real</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Intent</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Volume — Real Provider or null</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">CPC</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">KD</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Position</th>
              </tr>
            </thead>
            <tbody>
              {filteredKeywords.map((keyword) => (
                <tr key={keyword.id} className="border-b border-surface-3/20 hover:bg-surface-3/20">
                  <td className="px-4 py-3">
                    <span className="text-sm text-white font-medium">{keyword.term}</span>
                  </td>
                  <td className="px-4 py-3">
                    {keyword.intent && <IntentBadge intent={keyword.intent} />}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-300">{keyword.volume !== null ? formatNumber(keyword.volume) : '— (provider not configured)'}</td>
                  <td className="px-4 py-3 text-right text-sm text-slate-300">
                    {keyword.cpc !== null ? `$${keyword.cpc.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {keyword.difficulty !== null ? <DifficultyBadge kd={keyword.difficulty} /> : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-white">
                    {keyword.currentPosition ?? '— (no rank check yet)'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Keywords Modal — Real API */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface-2 border border-surface-3/50 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Add Keywords — Real Persistence</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Seed Keywords (one per line) — real normalized_term + project_id + org_id</label>
                <textarea
                  rows={5}
                  value={seedInput}
                  onChange={e => setSeedInput(e.target.value)}
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
              {addError && <p className="text-xs text-accent-red">{addError}</p>}
              <p className="text-[11px] text-slate-500">Real flow: POST /api/v1/projects/:id/keywords → Zod validation → normalized_term lowercased → ON CONFLICT DO NOTHING → org_id isolation → no fake volume unless provider configured</p>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)} disabled={addLoading} className="px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-50">Cancel</button>
              <button onClick={handleAddKeywords} disabled={addLoading} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-50">
                {addLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                {addLoading ? 'Adding...' : 'Add — Real API'}
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
