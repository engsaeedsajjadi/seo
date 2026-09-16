import { useState, useEffect } from 'react';
import { Target, Plus, AlertCircle, Globe } from 'lucide-react';
import { useAppState } from '../lib/store';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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

      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-12 text-center">
        <Target className="w-12 h-12 text-slate-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">No Competitors Added</h3>
        <p className="text-sm text-slate-400 mb-4">Add competitor domains to start analyzing their SEO performance.</p>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Competitor
        </button>
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
