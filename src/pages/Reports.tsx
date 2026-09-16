import { useState } from 'react';
import {
  FileText, Plus, Download, Calendar, Clock, CheckCircle2,
  AlertCircle, Eye, Share2, Trash2, Filter
} from 'lucide-react';
import { useAppState } from '../lib/store';

export default function Reports() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { state } = useAppState();

  const reports = [
    { id: '1', title: 'Monthly SEO Report - June 2024', type: 'Executive', format: 'PDF', status: 'ready', createdAt: '2024-06-30', scheduled: true },
    { id: '2', title: 'Technical Audit Report', type: 'Technical', format: 'HTML', status: 'ready', createdAt: '2024-06-28', scheduled: false },
    { id: '3', title: 'Keyword Performance Report', type: 'Keywords', format: 'CSV', status: 'ready', createdAt: '2024-06-25', scheduled: false },
    { id: '4', title: 'Competitor Analysis Q2', type: 'Competitor', format: 'PDF', status: 'generating', createdAt: '2024-06-24', scheduled: false },
    { id: '5', title: 'Weekly Rank Report', type: 'Rankings', format: 'PDF', status: 'ready', createdAt: '2024-06-22', scheduled: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-sm text-slate-400 mt-1">Generate and schedule SEO reports</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
          <Plus className="w-4 h-4" /> Generate Report
        </button>
      </div>

      {/* Report Types */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { type: 'SEO Report', icon: '📊', desc: 'Full SEO overview' },
          { type: 'Technical Audit', icon: '🔍', desc: 'Technical issues' },
          { type: 'Keyword Report', icon: '🔑', desc: 'Keyword performance' },
          { type: 'Rank Report', icon: '📈', desc: 'Position tracking' },
          { type: 'Executive', icon: '📋', desc: 'Client-ready summary' },
        ].map((rt, i) => (
          <button key={i} className="bg-surface-2 border border-surface-3/50 rounded-xl p-4 hover:border-brand-600/30 transition-colors text-left">
            <span className="text-2xl">{rt.icon}</span>
            <p className="text-xs font-semibold text-white mt-2">{rt.type}</p>
            <p className="text-[10px] text-slate-400">{rt.desc}</p>
          </button>
        ))}
      </div>

      {/* Reports List */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-3/50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Generated Reports</h3>
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select className="text-xs bg-transparent text-slate-300 focus:outline-none">
              <option>All Types</option>
              <option>Executive</option>
              <option>Technical</option>
              <option>Keywords</option>
            </select>
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-3/50">
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Report</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Type</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Format</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Status</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-400">Created</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map(report => (
              <tr key={report.id} className="border-b border-surface-3/20 hover:bg-surface-3/20">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-white">{report.title}</span>
                    {report.scheduled && <span title="Scheduled"><Calendar className="w-3 h-3 text-brand-400" /></span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-300">{report.type}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded text-[10px] bg-surface-3/50 text-slate-300">{report.format}</span>
                </td>
                <td className="px-4 py-3">
                  {report.status === 'ready' ? (
                    <span className="flex items-center gap-1 text-xs text-accent-green"><CheckCircle2 className="w-3 h-3" /> Ready</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-accent-yellow"><Clock className="w-3 h-3" /> Generating</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-xs text-slate-400">{report.createdAt}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button className="p-1.5 rounded hover:bg-surface-3/50 text-slate-400 hover:text-white" title="View">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-surface-3/50 text-slate-400 hover:text-white" title="Download">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-surface-3/50 text-slate-400 hover:text-white" title="Share">
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Scheduled Reports */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Scheduled Reports</h3>
        <div className="space-y-3">
          {[
            { name: 'Weekly SEO Summary', schedule: 'Every Monday at 9:00 AM', recipients: 'team@company.com', format: 'PDF' },
            { name: 'Monthly Executive Report', schedule: '1st of each month', recipients: 'client@example.com, manager@company.com', format: 'PDF' },
          ].map((sched, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
              <div>
                <p className="text-sm text-white font-medium">{sched.name}</p>
                <p className="text-xs text-slate-400">{sched.schedule} · {sched.recipients}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] bg-surface-3/50 text-slate-300">{sched.format}</span>
                <button className="p-1.5 rounded hover:bg-surface-3/50 text-slate-400 hover:text-accent-red">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface-2 border border-surface-3/50 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Generate Report</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Report Type</label>
                <select className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white">
                  <option>SEO Report</option>
                  <option>Technical Audit</option>
                  <option>Keyword Performance</option>
                  <option>Rank Tracking</option>
                  <option>Competitor Analysis</option>
                  <option>Executive Summary</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Format</label>
                <select className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white">
                  <option>PDF</option>
                  <option>HTML</option>
                  <option>CSV</option>
                  <option>JSON</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Date Range</label>
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" className="px-3 py-2 bg-surface border border-surface-3/50 rounded-lg text-sm text-white" />
                  <input type="date" className="px-3 py-2 bg-surface border border-surface-3/50 rounded-lg text-sm text-white" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="schedule" className="rounded" />
                <label htmlFor="schedule" className="text-xs text-slate-300">Schedule recurring generation</label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg">Generate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
