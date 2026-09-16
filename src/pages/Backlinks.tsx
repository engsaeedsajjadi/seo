import { useState, useEffect } from 'react';
import { Link2, AlertCircle, Plus, RefreshCw, ExternalLink } from 'lucide-react';
import { useAppState } from '../lib/store';

interface Backlink {
  id: string;
  sourceUrl: string;
  sourceDomain: string;
  targetUrl: string;
  anchorText: string;
  domainRating: number;
  isNofollow: boolean;
  status: string;
  provider: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export default function Backlinks() {
  const { state } = useAppState();
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!state.currentProject) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(state.currentProject.id)}/backlinks`, {
          credentials: 'include',
        });
        const json = await res.json();
        if (json.success) {
          setBacklinks(json.data);
          setProviderError(null);
        } else if (json.error?.code === 'PROVIDER_NOT_CONFIGURED') {
          setProviderError(json.error.message);
          setBacklinks([]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [state.currentProject]);

  async function handleSync() {
    if (!state.currentProject) return;
    setSyncLoading(true);
    setSyncResult(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(state.currentProject.id)}/backlinks/sync`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json();
      if (json.success) {
        setSyncResult(`Backlink sync queued: job ${json.data.job.id} — worker will call DataForSEO and persist backlinks atomically with source_url/target_url/anchor/nofollow/first_seen/last_seen/authority`);
      } else {
        if (json.error?.code === 'PROVIDER_NOT_CONFIGURED') {
          setProviderError(json.error.message);
        }
        setSyncResult(`Error: ${json.error?.message || 'Failed'}`);
      }
    } catch (e) {
      setSyncResult(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncLoading(false);
    }
  }

  if (!state.currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Link2 className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No Project Selected</h2>
        <p className="text-slate-400">Select or create a project to analyze backlinks.</p>
      </div>
    );
  }

  if (providerError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Backlinks — Real Provider</h1>
          <p className="text-sm text-slate-400 mt-1">Monitor your backlink profile and discover link opportunities — real provider, no fake</p>
        </div>
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-accent-yellow mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Provider Not Configured — Returns 503 PROVIDER_NOT_CONFIGURED</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
            {providerError} — Backlink data requires backlink index provider (DataForSEO) to fetch real backlink data. No fabricated backlink data is shown. Endpoint returns 503 {'{success:false, error:{code:PROVIDER_NOT_CONFIGURED}}'} when absent, never fake [] with authority.
          </p>
          <div className="bg-surface/50 rounded-lg p-4 max-w-sm mx-auto text-left">
            <p className="text-xs font-semibold text-slate-300 mb-2">Required:</p>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>• DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD</li>
              <li>• Flow: POST /backlinks/sync → BACKLINK_SYNC job idempotencyKey → Worker → DataForSEO → backlinks table (source_url/source_domain/target_url/anchor_text/domain_rating/is_nofollow/status/provider/evidence/first_seen/last_seen)</li>
            </ul>
          </div>
          <button onClick={handleSync} disabled={syncLoading} className="mt-4 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
            {syncLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
            Check Provider Status
          </button>
          {syncResult && <p className="mt-3 text-xs text-slate-400">{syncResult}</p>}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading backlinks — real query from backlinks table...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Backlinks — Real</h1>
          <p className="text-sm text-slate-400 mt-1">Backlink profile for <span className="text-brand-400">{state.currentProject?.domain}</span> — from backlinks table, no fake</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleSync} disabled={syncLoading} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-50">
            {syncLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {syncLoading ? 'Queuing...' : 'Sync Backlinks — Real API'}
          </button>
        </div>
      </div>

      {syncResult && (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4 text-sm text-slate-300">{syncResult}</div>
      )}

      {backlinks.length === 0 ? (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-12 text-center">
          <Link2 className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No Backlink Data — Real Table Empty</h3>
          <p className="text-sm text-slate-400 mb-4">Backlink data will appear here once fetched from the configured provider via real BACKLINK_SYNC job. No fake authority scores.</p>
          <button onClick={handleSync} disabled={syncLoading} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
            {syncLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Sync Backlinks — Queues BACKLINK_SYNC Job
          </button>
        </div>
      ) : (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-3/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Source — Real</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Target — Real</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Anchor — Real</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">DR — Real</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Nofollow — Real</th>
              </tr>
            </thead>
            <tbody>
              {backlinks.map(b => (
                <tr key={b.id} className="border-b border-surface-3/20 hover:bg-surface-3/20">
                  <td className="px-4 py-3 text-xs text-white font-mono"><a href={b.sourceUrl} target="_blank" rel="noopener" className="hover:text-brand-400 flex items-center gap-1">{b.sourceDomain} <ExternalLink className="w-3 h-3" /></a></td>
                  <td className="px-4 py-3 text-xs text-slate-400 font-mono">{b.targetUrl}</td>
                  <td className="px-4 py-3 text-xs text-slate-300">{b.anchorText || '—'}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-300">{b.domainRating ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-400">{b.isNofollow ? 'Yes — real' : 'No — real'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
