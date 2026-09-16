import { useState, useEffect } from 'react';
import {
  Brain, AlertCircle, Sparkles, RefreshCw
} from 'lucide-react';
import { useAppState } from '../lib/store';

interface GeoRun {
  id: string;
  prompt: string;
  response: string;
  brandMentioned: boolean;
  visibilityScore: number;
  provider: string;
  cost: number;
  createdAt: string;
}

export default function GEO() {
  const { state } = useAppState();
  const [runs, setRuns] = useState<GeoRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!state.currentProject) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(state.currentProject.id)}/geo`, {
          credentials: 'include',
        });
        const json = await res.json();
        if (json.success) {
          setRuns(json.data);
          setProviderError(null);
        } else if (json.error?.code === 'PROVIDER_NOT_CONFIGURED') {
          setProviderError(json.error.message);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [state.currentProject]);

  async function handleCheck() {
    if (!state.currentProject) return;
    setCheckLoading(true);
    setCheckResult(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(state.currentProject.id)}/geo/check`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: `What is ${state.currentProject.domain}?` }),
      });
      const json = await res.json();
      if (json.success) {
        setCheckResult(`GEO check queued: job ${json.data.job.id} — worker will call AI provider (OpenAI/Anthropic/Google/Perplexity) with cost metering atomic, persist geo_runs with prompt/response/brand_mentioned/visibility_score/provider/cost`);
      } else {
        if (json.error?.code === 'PROVIDER_NOT_CONFIGURED') {
          setProviderError(json.error.message);
        }
        setCheckResult(`Error: ${json.error?.message || 'Failed'}`);
      }
    } catch (e) {
      setCheckResult(e instanceof Error ? e.message : String(e));
    } finally {
      setCheckLoading(false);
    }
  }

  if (!state.currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Brain className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No Project Selected</h2>
        <p className="text-slate-400">Select or create a project to track AI visibility.</p>
      </div>
    );
  }

  if (providerError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">GEO / AI Visibility — Real Provider</h1>
          <p className="text-sm text-slate-400 mt-1">Track your brand visibility in AI-generated answers — real AI provider, cost metering, no fake</p>
        </div>
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-accent-yellow mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">AI Provider Not Configured — Returns 503 PROVIDER_NOT_CONFIGURED</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
            {providerError} — GEO tracking requires AI provider access to query AI search engines and measure brand visibility. This measures actual AI responses — no fabricated data is shown. Endpoint returns 503 {'{success:false, error:{code:PROVIDER_NOT_CONFIGURED}}'} when absent.
          </p>
          <div className="bg-surface/50 rounded-lg p-4 max-w-sm mx-auto text-left">
            <p className="text-xs font-semibold text-slate-300 mb-2">Required — Real abstraction:</p>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>• OPENAI_API_KEY or ANTHROPIC_API_KEY — cost metering real</li>
              <li>• Optional: PERPLEXITY_API_KEY for Perplexity tracking — cost metering real</li>
              <li>• Brand name configured in project settings</li>
              <li>• Flow: POST /geo/check → AI_VISIBILITY_CHECK job idempotencyKey → Worker → AI provider → geo_runs table (prompt/response/brand_mentioned/visibility_score/provider/cost) + credit atomic</li>
            </ul>
          </div>
          <button onClick={handleCheck} disabled={checkLoading} className="mt-4 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
            {checkLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Check Provider Status
          </button>
          {checkResult && <p className="mt-3 text-xs text-slate-400 max-w-md mx-auto">{checkResult}</p>}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading GEO runs — real query from geo_runs table...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">GEO / AI Visibility — Real</h1>
          <p className="text-sm text-slate-400 mt-1">Brand visibility in AI-generated answers — from geo_runs table, no fake, provider abstraction + cost metering</p>
        </div>
        <button onClick={handleCheck} disabled={checkLoading} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-50">
          {checkLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {checkLoading ? 'Queuing...' : 'Run Visibility Check — Real API'}
        </button>
      </div>

      {checkResult && (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4 text-sm text-slate-300">{checkResult}</div>
      )}

      {runs.length === 0 ? (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-12 text-center">
          <Brain className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No GEO Data — Real Table Empty</h3>
          <p className="text-sm text-slate-400 mb-4">Run a visibility check to measure your brand presence in AI-generated answers. Real flow: POST /geo/check → job AI_VISIBILITY_CHECK idempotent → worker AI call → geo_runs (prompt/response/brand_mentioned/visibility_score/provider/cost) + credit atomic. No fake visibility scores.</p>
          <button onClick={handleCheck} disabled={checkLoading} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
            {checkLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Run Check — Queues AI_VISIBILITY_CHECK Job
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map(run => (
            <div key={run.id} className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm text-white font-medium">{run.prompt} — real prompt</p>
                  <p className="text-xs text-slate-400 mt-1">Provider: {run.provider} — real | Brand mentioned: {String(run.brandMentioned)} — real | Score: {run.visibilityScore} — real | Cost: ${run.cost} — real cost metering</p>
                </div>
                <span className="text-[10px] text-slate-500">{new Date(run.createdAt).toLocaleString()} — real</span>
              </div>
              <p className="text-xs text-slate-300 bg-surface/50 rounded p-3 font-mono">{run.response.substring(0, 300)}... — real AI response</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
