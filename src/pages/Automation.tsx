import {
  Zap, Clock, Play, Pause, CheckCircle2, XCircle,
  AlertCircle, Calendar, RefreshCw, Settings, Plus
} from 'lucide-react';
import { useAppState } from '../lib/store';
import type { JobType, JobStatus } from '../lib/types';

export default function Automation() {
  const { state } = useAppState();

  const scheduledJobs = [
    { type: 'SITE_CRAWL', schedule: 'Daily at 2:00 AM', lastRun: '6 hours ago', nextRun: 'Tomorrow 2:00 AM', status: 'active' as const },
    { type: 'RANK_CHECK', schedule: 'Every 6 hours', lastRun: '2 hours ago', nextRun: '4 hours', status: 'active' as const },
    { type: 'GSC_SYNC', schedule: 'Daily at 6:00 AM', lastRun: '18 hours ago', nextRun: 'Tomorrow 6:00 AM', status: 'active' as const },
    { type: 'PAGESPEED_CHECK', schedule: 'Weekly (Monday)', lastRun: '3 days ago', nextRun: '4 days', status: 'active' as const },
    { type: 'BACKLINK_REFRESH', schedule: 'Weekly (Wednesday)', lastRun: '5 days ago', nextRun: '2 days', status: 'active' as const },
    { type: 'COMPETITOR_CHECK', schedule: 'Weekly (Friday)', lastRun: '1 day ago', nextRun: '6 days', status: 'paused' as const },
    { type: 'AI_VISIBILITY_CHECK', schedule: 'Daily at 8:00 AM', lastRun: '14 hours ago', nextRun: 'Tomorrow 8:00 AM', status: 'active' as const },
    { type: 'REPORT_GENERATION', schedule: 'Monthly (1st)', lastRun: '28 days ago', nextRun: '3 days', status: 'active' as const },
  ];

  const recentJobs = [
    { type: 'SITE_CRAWL', status: 'completed' as JobStatus, duration: '4m 32s', pages: 450, startedAt: '6 hours ago' },
    { type: 'RANK_CHECK', status: 'completed' as JobStatus, duration: '1m 15s', pages: null, startedAt: '2 hours ago' },
    { type: 'GSC_SYNC', status: 'completed' as JobStatus, duration: '45s', pages: null, startedAt: '18 hours ago' },
    { type: 'PAGESPEED_CHECK', status: 'failed' as JobStatus, duration: '30s', pages: null, startedAt: '3 days ago', error: 'Provider timeout' },
    { type: 'REPORT_GENERATION', status: 'completed' as JobStatus, duration: '2m 10s', pages: null, startedAt: '28 days ago' },
    { type: 'KEYWORD_REFRESH', status: 'running' as JobStatus, duration: '...', pages: null, startedAt: 'Just now' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Automation</h1>
          <p className="text-sm text-slate-400 mt-1">Scheduled jobs and background tasks</p>
        </div>
        <button className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Schedule
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">Active Schedules</p>
          <p className="text-2xl font-bold text-accent-green mt-1">{scheduledJobs.filter(j => j.status === 'active').length}</p>
        </div>
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">Jobs Today</p>
          <p className="text-2xl font-bold text-white mt-1">14</p>
        </div>
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">Success Rate</p>
          <p className="text-2xl font-bold text-accent-green mt-1">94%</p>
        </div>
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">Failed (7d)</p>
          <p className="text-2xl font-bold text-accent-red mt-1">2</p>
        </div>
      </div>

      {/* Scheduled Jobs */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-3/50">
          <h3 className="text-sm font-semibold text-white">Scheduled Jobs</h3>
        </div>
        <div className="divide-y divide-surface-3/20">
          {scheduledJobs.map((job, i) => (
            <div key={i} className="flex items-center justify-between p-4 hover:bg-surface-3/20">
              <div className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  job.status === 'active' ? 'bg-accent-green/20' : 'bg-surface-3/50'
                }`}>
                  {job.status === 'active' ? (
                    <Play className="w-4 h-4 text-accent-green" />
                  ) : (
                    <Pause className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{job.type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-slate-400">{job.schedule}</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-xs text-slate-300">Last: {job.lastRun}</p>
                  <p className="text-xs text-slate-400">Next: {job.nextRun}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button className="p-1.5 rounded hover:bg-surface-3/50 text-slate-400 hover:text-white" title="Run now">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button className="p-1.5 rounded hover:bg-surface-3/50 text-slate-400 hover:text-white" title="Settings">
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Job Executions */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-3/50">
          <h3 className="text-sm font-semibold text-white">Recent Executions</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-3/50">
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Job</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Status</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-400">Duration</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-400">Details</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-400">Started</th>
            </tr>
          </thead>
          <tbody>
            {recentJobs.map((job, i) => (
              <tr key={i} className="border-b border-surface-3/20 hover:bg-surface-3/20">
                <td className="px-4 py-2.5 text-sm text-white">{job.type.replace(/_/g, ' ')}</td>
                <td className="px-4 py-2.5">
                  <JobStatusBadge status={job.status} />
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-slate-300">{job.duration}</td>
                <td className="px-4 py-2.5 text-right text-xs text-slate-400">
                  {job.pages ? `${job.pages} pages` : job.error || '—'}
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-slate-400">{job.startedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Worker Architecture */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Worker Architecture</h3>
        <p className="text-xs text-slate-400 mb-4">
          Jobs are processed by a dedicated worker process using PostgreSQL-native job queue (pg-boss).
          Features: automatic retries with exponential backoff, dead-letter handling, idempotency,
          concurrency limits, and provider rate limiting.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Queue Depth', value: '2', color: 'text-accent-green' },
            { label: 'Workers Active', value: '3', color: 'text-brand-400' },
            { label: 'Avg Duration', value: '2m 15s', color: 'text-white' },
            { label: 'Dead Letters', value: '0', color: 'text-accent-green' },
          ].map((stat, i) => (
            <div key={i} className="bg-surface/50 rounded-lg p-3 text-center">
              <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-[10px] text-slate-400">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function JobStatusBadge({ status }: { status: JobStatus }) {
  const styles: Record<JobStatus, string> = {
    pending: 'bg-slate-500/20 text-slate-400',
    running: 'bg-brand-500/20 text-brand-400',
    completed: 'bg-green-500/20 text-green-400',
    failed: 'bg-red-500/20 text-red-400',
    cancelled: 'bg-yellow-500/20 text-yellow-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}
