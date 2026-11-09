import { useState, useEffect } from 'react';
import {
  Zap, Clock, Play, Pause, CheckCircle2, XCircle,
  RefreshCw, Settings, Plus, Activity
} from 'lucide-react';
import { useAppState } from '../lib/store';
import SchedulePanel from '../components/SchedulePanel';
import { api } from '../lib/api';
import type { Job, JobStatus } from '../lib/types';
import { JOB_TYPE_LABELS, JOB_STATUS_LABELS, formatDateTime, jobFailureReason } from '../lib/labels';

const isFailed = (status: string) => status === 'failed' || status === 'dead_letter';
import { t } from '../i18n';
import { toPersianDigits, formatPersianDate, formatPersianNumber, formatCurrency, formatRelativePersianTime } from '../lib/persian';

export default function Automation() {
  const { state } = useAppState();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadJobs() {
      if (!state.currentProject) {
        setLoading(false);
        return;
      }

      try {
        const result = await api.getJobs(state.currentProject.id);
        if (result.success) setJobs(result.data);
      } catch (error) {
        console.error('Failed to load jobs:', error);
      } finally {
        setLoading(false);
      }
    }

    loadJobs();
  }, [state.currentProject]);

  if (!state.currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center" dir="rtl">
        <Zap className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">پروژه‌ای انتخاب نشده</h2>
        <p className="text-slate-400">برای زمان‌بندی کارها یک پروژه انتخاب یا ایجاد کنید.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">در حال بارگذاری کارها…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">زمان‌بندی خودکار</h1>
          <p className="text-sm text-slate-400 mt-1">کارهایی که برنامه خودش سر وقت انجام می‌دهد، و سابقهٔ کارهای انجام‌شده</p>
        </div>
        
      </div>

      <SchedulePanel projectId={state.currentProject.id} />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">کل کارها</p>
          <p className="text-2xl font-bold text-white mt-1">{toPersianDigits(jobs.length)}</p>
        </div>
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">در حال اجرا</p>
          <p className="text-2xl font-bold text-brand-400 mt-1">{toPersianDigits(jobs.filter(j => j.status === 'running').length)}</p>
        </div>
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">تکمیل‌شده</p>
          <p className="text-2xl font-bold text-accent-green mt-1">{toPersianDigits(jobs.filter(j => j.status === 'completed').length)}</p>
        </div>
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">ناموفق</p>
          <p className="text-2xl font-bold text-accent-red mt-1">{toPersianDigits(jobs.filter(j => isFailed(j.status)).length)}</p>
        </div>
      </div>

      {/* Recent Job Executions */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-3/50">
          <h3 className="text-sm font-semibold text-white">تاریخچهٔ کارها</h3>
        </div>
        {jobs.length === 0 ? (
          <div className="p-12 text-center">
            <Activity className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">هنوز کاری اجرا نشده است</h3>
            <p className="text-sm text-slate-400">با بررسی سایت، بررسی رتبه یا کارهای دیگر، کارها اینجا نمایش داده می‌شوند.</p>
          </div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-surface-3/50">
                <th className="text-right px-4 py-2 text-xs font-medium text-slate-400">کار</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-slate-400">وضعیت</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-slate-400">شروع</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-slate-400">پایان</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-slate-400">دفعات اجرا</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-surface-3/20 hover:bg-surface-3/20">
                  <td className="px-4 py-2.5 text-sm text-white">{JOB_TYPE_LABELS[job.type] || job.type}</td>
                  <td className="px-4 py-2.5">
                    <JobStatusBadge status={job.status} />
                    {isFailed(job.status) && <p className="text-[11px] text-red-400 mt-1">{jobFailureReason(job.error)}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-slate-400">
                    {formatDateTime(job.startedAt)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-slate-400">
                    {formatDateTime(job.completedAt)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-slate-300">{toPersianDigits(job.attempts)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function JobStatusBadge({ status }: { status: JobStatus }) {
  const styles: Record<string, string> = {
    pending: 'bg-slate-500/20 text-slate-400',
    running: 'bg-brand-500/20 text-brand-400',
    completed: 'bg-green-500/20 text-green-400',
    failed: 'bg-red-500/20 text-red-400',
    dead_letter: 'bg-red-500/20 text-red-400',
    cancelled: 'bg-yellow-500/20 text-yellow-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${styles[status]}`}>
      {JOB_STATUS_LABELS[status] || status}
    </span>
  );
}
