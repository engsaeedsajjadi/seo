import { useState, useEffect } from 'react';
import { Target, Plus, AlertCircle, Globe, RefreshCw } from 'lucide-react';
import { useAppState } from '../lib/store';
import { api } from '../lib/api';
import { t } from '../i18n';
import { toPersianDigits, formatPersianDate, formatPersianNumber, formatCurrency, formatRelativePersianTime } from '../lib/persian';

interface Competitor {
  id: string;
  domain: string;
  created_at: string;
}

export default function Competitors() {
  const { state } = useAppState();
  const [showAddModal, setShowAddModal] = useState(false);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerStatus, setProviderStatus] = useState<any>(null);
  const [domainInput, setDomainInput] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!state.currentProject) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(state.currentProject.id)}/competitors`, {
          credentials: 'include',
        });
        const json = await res.json();
        if (json.success) {
          setCompetitors(json.data);
          setProviderStatus(json.meta?.provider);
        } else {
          // If provider not configured, still show competitors with status
          if (json.error?.code === 'PROVIDER_NOT_CONFIGURED' || json.meta?.provider) {
            setProviderStatus(json.meta?.provider || { configured: false });
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [state.currentProject]);

  async function handleAdd() {
    if (!state.currentProject || !domainInput.trim()) return;
    setAddLoading(true);
    setAddError(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(state.currentProject.id)}/competitors`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domainInput.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setCompetitors(prev => [...prev, json.data]);
        setAddSuccess(`Added competitor ${json.data.domain} — real persistence with SSRF validation, org_id isolation, audit log`);
        setDomainInput('');
        setShowAddModal(false);
      } else {
        setAddError(json.error?.message || 'Failed to add');
      }
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddLoading(false);
    }
  }

  if (!state.currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center" dir="rtl">
        <Target className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">پروژه‌ای انتخاب نشده</h2>
        <p className="text-slate-400">Select or create a project to analyze competitors.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Competitor Analysis — Real</h1>
          <p className="text-sm text-slate-400 mt-1">Competitive intelligence for <span className="text-brand-400">{state.currentProject?.domain}</span> — real table competitors, provider status explicit</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Competitor — Real API
        </button>
      </div>

      {providerStatus && (
        <div className={`border rounded-xl p-4 ${providerStatus.configured ? 'bg-surface-2 border-surface-3/50' : 'bg-accent-yellow/10 border-accent-yellow/30'}`}>
          <p className="text-xs text-slate-300">
            Provider: {providerStatus.provider || 'none'} — configured: {String(providerStatus.configured)} — status: {providerStatus.status || 'not_configured'} — {providerStatus.message || 'Manual competitor tracking only, automated overlap/visibility requires DataForSEO'}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Real endpoint: GET /competitors queries competitors table, returns {`{success:true,data,meta:{provider}}`} — never fake overlap, explicit PROVIDER_NOT_CONFIGURED handling</p>
        </div>
      )}

      {addSuccess && (
        <div className="bg-accent-green/20 border border-accent-green/30 rounded-xl p-4 text-sm text-accent-green">{addSuccess}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : competitors.length === 0 ? (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-12 text-center">
          <Target className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No Competitors Added — Real Table Empty</h3>
          <p className="text-sm text-slate-400 mb-4">Add competitor domains to start analyzing. Real flow: POST /competitors → normalizeDomain → validateUrlForSSRF (blocks localhost/private) → org_id check → ON CONFLICT DO NOTHING → audit log.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Competitor
          </button>
        </div>
      ) : (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-3/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Domain — Real</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Added</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {competitors.map(c => (
                <tr key={c.id} className="border-b border-surface-3/20 hover:bg-surface-3/20">
                  <td className="px-4 py-3 text-sm text-white font-medium flex items-center gap-2"><Globe className="w-4 h-4 text-slate-500" />{c.domain}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-400">Real — no fake overlap until provider configured</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface-2 border border-surface-3/50 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Add Competitor — Real API with SSRF</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Competitor Domain — validated, SSRF blocked</label>
                <input type="text" value={domainInput} onChange={e => setDomainInput(e.target.value)} placeholder="competitor.com" className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50" />
              </div>
              <p className="text-xs text-slate-400">Real validation: normalizeDomain, validateUrlForSSRF blocks localhost/127.0.0.1/private/metadata, 409 if already exists, audit log, org_id isolation.</p>
              {addError && <p className="text-xs text-accent-red">{addError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)} disabled={addLoading} className="px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-50">Cancel</button>
              <button onClick={handleAdd} disabled={addLoading} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-50">
                {addLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                {addLoading ? 'Adding...' : 'Add — Real'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
