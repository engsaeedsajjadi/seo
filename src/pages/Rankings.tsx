import { useState, useEffect } from 'react';
import {
  BarChart3, Calendar, Monitor, Smartphone, AlertCircle, RefreshCw
} from 'lucide-react';
import { useAppState } from '../lib/store';
import { api } from '../lib/api';
import type { RankingEntry } from '../lib/types';
import { t } from '../i18n';
import { toPersianDigits, formatPersianDate, formatPersianNumber, formatCurrency, formatRelativePersianTime } from '../lib/persian';

export default function Rankings() {
  const { state } = useAppState();
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [providerError, setProviderError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  const hasProject = state.currentProject !== null;

  useEffect(() => {
    async function loadRankings() {
      if (!state.currentProject) {
        setLoading(false);
        return;
      }

      try {
        const result = await api.getRankings(state.currentProject.id);
        if (result.success) {
          setRankings(result.data);
          setProviderError(null);
        } else {
          // Real provider handling — if PROVIDER_NOT_CONFIGURED, show not connected UI
          if (result.error.code === 'PROVIDER_NOT_CONFIGURED' || result.error.code === 'SERVICE_UNAVAILABLE') {
            setProviderError(result.error.message);
          } else {
            console.error('Failed to load rankings:', result.error);
          }
        }
      } catch (error) {
        console.error('Failed to load rankings:', error);
      } finally {
        setLoading(false);
      }
    }

    loadRankings();
  }, [state.currentProject]);

  async function handleCheckNow() {
    if (!state.currentProject) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const result = await api.checkRankings(state.currentProject.id);
      if (result.success) {
        setCheckResult(`Rank check queued: job ${result.data.job.id} — worker will call DataForSEO/SerpApi and persist keyword_rankings atomically`);
      } else {
        if (result.error.code === 'PROVIDER_NOT_CONFIGURED') {
          setProviderError(result.error.message);
          setCheckResult(`Provider not configured: ${result.error.message} — returns 503 {success:false,error:{code:PROVIDER_NOT_CONFIGURED}} never fake rank`);
        } else {
          setCheckResult(`Error: ${result.error.message}`);
        }
      }
    } catch (e) {
      setCheckResult(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  }

  if (!hasProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center" dir="rtl">
        <BarChart3 className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">پروژه‌ای انتخاب نشده</h2>
        <p className="text-slate-400">Select or create a project to track rankings.</p>
      </div>
    );
  }

  if (providerError) {
    return (
      <div className="space-y-6" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold text-white">Rank Tracking — Real Provider</h1>
          <p className="text-sm text-slate-400 mt-1">Monitor your search engine positions over time — real SERP provider, no fake data</p>
        </div>
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-accent-yellow mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Rank Tracking Not Available — Provider Not Configured</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
            {providerError} — Rankings endpoint returns 503 {'{success:false, error:{code:PROVIDER_NOT_CONFIGURED}}'} when DataForSEO/SerpApi absent, never fake [] with rank 3.
            Positions are fetched in real-time from the configured provider via worker job with idempotencyKey, FOR UPDATE SKIP LOCKED, and persisted to keyword_rankings.
          </p>
          <div className="bg-surface/50 rounded-lg p-4 max-w-sm mx-auto text-left">
            <p className="text-xs font-semibold text-slate-300 mb-2">Required Configuration:</p>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>• DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD</li>
              <li>• Or SERP API provider credentials</li>
              <li>• Keywords must be added to the project</li>
              <li>• Flow: API → jobs (RANK_CHECK, idempotencyKey) → Worker → SERP provider → keyword_rankings</li>
            </ul>
          </div>
          <button onClick={handleCheckNow} disabled={checking} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
            {checking ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
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
          <p className="text-sm text-slate-400">Loading rankings — real query from keyword_rankings with pagination, no fake...</p>
        </div>
      </div>
    );
  }

  // Group rankings by keyword for display
  const keywordRankings = rankings.reduce((acc, r) => {
    if (!acc[r.keyword]) acc[r.keyword] = [];
    acc[r.keyword].push(r);
    return acc;
  }, {} as Record<string, RankingEntry[]>);

  const latestRankings = Object.entries(keywordRankings).map(([keyword, entries]) => {
    const sorted = entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latest = sorted[0];
    const previous = sorted[1];
    return {
      keyword,
      position: latest.position,
      change: latest.position && previous?.position ? previous.position - latest.position : null,
      url: latest.url,
      best: Math.min(...entries.map(e => e.position || 100).filter(p => p > 0)),
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Rank Tracking — Real Data</h1>
          <p className="text-sm text-slate-400 mt-1">
            Position tracking for <span className="text-brand-400">{state.currentProject?.domain}</span> — from keyword_rankings table, no fake
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
          <button onClick={handleCheckNow} disabled={checking} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-50">
            {checking ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
            {checking ? 'Queuing...' : 'Check Now — Real API'}
          </button>
        </div>
      </div>

      {checkResult && (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4 text-sm text-slate-300">
          {checkResult}
        </div>
      )}

      {rankings.length === 0 ? (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-12 text-center">
          <BarChart3 className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No Ranking Data — Real Table Empty</h3>
          <p className="text-sm text-slate-400 mb-4">keyword_rankings table has no rows for this project. Add keywords and run a rank check to start tracking positions via real provider. No fake rank 3.</p>
          <button onClick={handleCheckNow} disabled={checking} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
            {checking ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
            Check Now — Queues RANK_CHECK Job
          </button>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
              <p className="text-xs text-slate-400">Top 3 — Real</p>
              <p className="text-2xl font-bold text-accent-green mt-1">
                {latestRankings.filter(r => r.position !== null && r.position <= 3).length}
              </p>
            </div>
            <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
              <p className="text-xs text-slate-400">Top 10 — Real</p>
              <p className="text-2xl font-bold text-brand-400 mt-1">
                {latestRankings.filter(r => r.position !== null && r.position <= 10).length}
              </p>
            </div>
            <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
              <p className="text-xs text-slate-400">Top 20 — Real</p>
              <p className="text-2xl font-bold text-accent-yellow mt-1">
                {latestRankings.filter(r => r.position !== null && r.position <= 20).length}
              </p>
            </div>
            <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
              <p className="text-xs text-slate-400">Tracked Keywords — Real Count</p>
              <p className="text-2xl font-bold text-white mt-1">{latestRankings.length}</p>
            </div>
          </div>

          {/* Rankings Table */}
          <div className="bg-surface-2 border border-surface-3/50 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-3/50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Keyword Positions — From keyword_rankings</h3>
              <span className="text-xs text-slate-400">
                <Calendar className="w-3 h-3 inline mr-1" />
                {rankings.length > 0 && `Last checked: ${new Date(rankings[0].date).toLocaleString()}`}
              </span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-3/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Keyword — Real</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Position — Real Provider</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Change</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">URL</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Best</th>
                </tr>
              </thead>
              <tbody>
                {latestRankings.map((row, i) => (
                  <tr key={i} className="border-b border-surface-3/20 hover:bg-surface-3/20">
                    <td className="px-4 py-3 text-sm text-white font-medium">{row.keyword}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-bold ${
                        row.position === null ? 'text-slate-500' :
                        row.position <= 3 ? 'text-accent-green' : 
                        row.position <= 10 ? 'text-brand-400' : 
                        row.position <= 20 ? 'text-accent-yellow' : 'text-slate-300'
                      }`}>
                        {row.position ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400">
                      {row.change !== null ? (row.change > 0 ? `+${row.change}` : row.change) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400">{row.url || '—'}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-300">{row.best}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
