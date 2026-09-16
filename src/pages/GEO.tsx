import {
  Brain, AlertCircle, Sparkles
} from 'lucide-react';
import { useAppState } from '../lib/store';

export default function GEO() {
  const { state } = useAppState();
  const aiConfigured = state.providerStatus.openai === 'connected' || state.providerStatus.anthropic === 'connected';

  if (!state.currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Brain className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No Project Selected</h2>
        <p className="text-slate-400">Select or create a project to track AI visibility.</p>
      </div>
    );
  }

  if (!aiConfigured) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">GEO / AI Visibility</h1>
          <p className="text-sm text-slate-400 mt-1">Track your brand visibility in AI-generated answers</p>
        </div>
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-accent-yellow mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">AI Provider Not Configured</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
            GEO tracking requires AI provider access to query AI search engines and measure brand visibility.
            This measures actual AI responses — no fabricated data is shown.
          </p>
          <div className="bg-surface/50 rounded-lg p-4 max-w-sm mx-auto text-left">
            <p className="text-xs font-semibold text-slate-300 mb-2">Required:</p>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>• OPENAI_API_KEY or ANTHROPIC_API_KEY</li>
              <li>• Optional: PERPLEXITY_API_KEY for Perplexity tracking</li>
              <li>• Brand name configured in project settings</li>
            </ul>
          </div>
          <p className="text-xs text-slate-500 mt-4">
            Note: GEO measurements are based on actual AI responses to configured prompts.
            Results may vary between queries and are clearly labeled as measured data.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">GEO / AI Visibility</h1>
          <p className="text-sm text-slate-400 mt-1">Brand visibility in AI-generated answers</p>
        </div>
        <button className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Run Visibility Check
        </button>
      </div>

      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-12 text-center">
        <Brain className="w-12 h-12 text-slate-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">No GEO Data</h3>
        <p className="text-sm text-slate-400 mb-4">Run a visibility check to measure your brand presence in AI-generated answers.</p>
      </div>
    </div>
  );
}
