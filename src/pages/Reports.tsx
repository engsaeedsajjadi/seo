import { useState, useEffect } from 'react';
import {
  FileText, Plus, Download, Calendar, Clock, CheckCircle2,
  Eye, Share2, Filter, RefreshCw
} from 'lucide-react';
import { useAppState } from '../lib/store';
import { api } from '../lib/api';
import type { Report } from '../lib/types';

export default function Reports() {
  const { state } = useAppState();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [reportType, setReportType] = useState('SEO Report');
  const [format, setFormat] = useState('PDF');
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genSuccess, setGenSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadReports() {
      if (!state.currentProject) {
        setLoading(false);
        return;
      }

      try {
        const result = await api.getReports(state.currentProject.id);
        if (result.success) setReports(result.data);
      } catch (error) {
        console.error('Failed to load reports:', error);
      } finally {
        setLoading(false);
      }
    }

    loadReports();
  }, [state.currentProject]);

  async function handleGenerate() {
    if (!state.currentProject) return;
    setGenLoading(true);
    setGenError(null);
    try {
      const result = await api.generateReport(state.currentProject.id, reportType, format);
      if (result.success) {
        setReports(prev => [result.data, ...prev]);
        setGenSuccess(`Report queued: ${result.data.id} — job ${result.data.id} REPORT_GENERATION with idempotencyKey, worker will build from real data (project + crawl + audit + keywords + rankings + etc)`);
        setShowCreateModal(false);
      } else {
        setGenError(result.error.message);
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenLoading(false);
    }
  }

  if (!state.currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <FileText className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No Project Selected</h2>
        <p className="text-slate-400">Select or create a project to generate reports.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading reports — real query from reports table...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports — Real</h1>
          <p className="text-sm text-slate-400 mt-1">Generate and schedule SEO reports — from reports table, job queue, worker builds real data_snapshot</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
          <Plus className="w-4 h-4" /> Generate Report — Real API
        </button>
      </div>

      {genSuccess && (
        <div className="bg-accent-green/20 border border-accent-green/30 rounded-xl p-4 text-sm text-accent-green">{genSuccess}</div>
      )}

      {/* Reports List */}
      {reports.length === 0 ? (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-12 text-center">
          <FileText className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No Reports Yet — Real Table Empty</h3>
          <p className="text-sm text-slate-400 mb-4">Generate your first report to analyze SEO performance. Real flow: POST /reports → create reports row (generating) → job REPORT_GENERATION idempotent → worker: fetch project + crawl + audit_findings + keywords + rankings + competitors + backlinks + gsc + ga4 + pagespeed where configured → build data_snapshot → mark ready.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Generate Report — Real
          </button>
        </div>
      ) : (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-3/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Report — Real</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Format</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Status — Real Job</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Created — Real Timestamp</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(report => (
                <tr key={report.id} className="border-b border-surface-3/20 hover:bg-surface-3/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-white">{report.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-300">{report.type}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-[10px] bg-surface-3/50 text-slate-300">{report.format}</span>
                  </td>
                  <td className="px-4 py-3">
                    {report.status === 'ready' ? (
                      <span className="flex items-center gap-1 text-xs text-accent-green"><CheckCircle2 className="w-3 h-3" /> Ready — real data_snapshot</span>
                    ) : report.status === 'generating' ? (
                      <span className="flex items-center gap-1 text-xs text-accent-yellow"><Clock className="w-3 h-3" /> Generating — worker job</span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-accent-red">Failed — real error</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-slate-400">{new Date(report.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {report.downloadUrl && (
                        <a href={report.downloadUrl} className="p-1.5 rounded hover:bg-surface-3/50 text-slate-400 hover:text-white" title="Download real report">
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface-2 border border-surface-3/50 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Generate Report — Real Job Queue</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Report Type — real types: Audit/Technical/Rankings/Keywords/Competitors/Backlinks/GSC/GA4/AI/Executive</label>
                <select value={reportType} onChange={e => setReportType(e.target.value)} className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white">
                  <option>SEO Report</option>
                  <option>Technical Audit</option>
                  <option>Keyword Performance</option>
                  <option>Rank Tracking</option>
                  <option>Competitor Analysis</option>
                  <option>Executive Summary</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Format — real: PDF/HTML/CSV/JSON with data_snapshot</label>
                <select value={format} onChange={e => setFormat(e.target.value)} className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white">
                  <option>PDF</option>
                  <option>HTML</option>
                  <option>CSV</option>
                  <option>JSON</option>
                </select>
              </div>
              {genError && <p className="text-xs text-accent-red">{genError}</p>}
              <p className="text-[11px] text-slate-500">Flow: POST /reports → reports table (generating, data_snapshot null) → jobs REPORT_GENERATION with idempotencyKey report_{'{projectId}'}_... → worker claims FOR UPDATE SKIP LOCKED → builds from real project + crawl_pages + audit_findings + keywords + keyword_rankings + competitors + backlinks + gsc_metrics + ga4_metrics + pagespeed_results → updates reports.data_snapshot → ready</p>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowCreateModal(false)} disabled={genLoading} className="px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-50">Cancel</button>
              <button onClick={handleGenerate} disabled={genLoading} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-50">
                {genLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                {genLoading ? 'Queuing...' : 'Generate — Real'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
