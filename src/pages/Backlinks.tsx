import { Link2, AlertCircle, Plus } from 'lucide-react';
import { useAppState } from '../lib/store';

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

      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-12 text-center">
        <Link2 className="w-12 h-12 text-slate-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">No Backlink Data</h3>
        <p className="text-sm text-slate-400 mb-4">Backlink data will appear here once fetched from the configured provider.</p>
      </div>
    </div>
  );
}
