import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarClock, Pause, Play, Trash2 } from 'lucide-react';
import { api, type Schedule } from '../lib/api';

const TYPES: Array<[string, string]> = [
  ['SITE_CRAWL', 'بررسی فنی سایت'], ['RANK_CHECK', 'بررسی رتبه'], ['BACKLINK_SYNC', 'همگام‌سازی بک‌لینک'],
  ['REPORT_GENERATION', 'تهیهٔ گزارش'], ['ALERT_EVALUATION', 'بررسی هشدارها'], ['GSC_SYNC', 'همگام‌سازی سرچ کنسول'], ['GA4_SYNC', 'همگام‌سازی آنالیتیکس'],
];
const FREQUENCIES: Array<[string, string]> = [['0 3 * * *', 'هر روز، ساعت ۳'], ['0 3 * * 6', 'هر هفته، شنبه ساعت ۳'], ['0 3 1 * *', 'هر ماه، روز اول']];
const label = (pairs: Array<[string, string]>, key: string) => pairs.find(([k]) => k === key)?.[1] || key;

export default function SchedulePanel({ projectId }: { projectId: string }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [type, setType] = useState('SITE_CRAWL');
  const [cron, setCron] = useState(FREQUENCIES[1][0]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api.getSchedules();
    if (result.success) setSchedules(result.data.filter((s) => !s.projectId || s.projectId === projectId));
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    const result = await api.createSchedule({ type, cronExpression: cron, timezone: 'Asia/Tehran', projectId });
    if (result.success) await load(); else setError(result.error.message);
    setBusy(false);
  }
  async function toggle(s: Schedule) { await api.setScheduleEnabled(s.id, !s.enabled); await load(); }
  async function remove(s: Schedule) { await api.deleteSchedule(s.id); await load(); }

  return (
    <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4 space-y-4">
      <h2 className="text-sm font-semibold text-white flex items-center gap-2"><CalendarClock className="w-4 h-4" /> زمان‌بندی‌ها</h2>
      <form onSubmit={create} className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-400">کار
          <select value={type} onChange={(e) => setType(e.target.value)} className="block mt-1 px-2 py-2 rounded bg-surface-3/40 text-sm text-white">
            {TYPES.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-400">تکرار
          <select value={cron} onChange={(e) => setCron(e.target.value)} className="block mt-1 px-2 py-2 rounded bg-surface-3/40 text-sm text-white">
            {FREQUENCIES.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
        </label>
        <button disabled={busy} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg">افزودن زمان‌بندی</button>
      </form>
      {error && <p role="alert" className="text-sm text-accent-red">{error}</p>}
      {schedules.length === 0 ? <p className="text-xs text-slate-500">هنوز زمان‌بندی‌ای ندارید.</p> : (
        <ul className="divide-y divide-surface-3/40">
          {schedules.map((s) => (
            <li key={s.id} className="py-2 flex items-center justify-between gap-3 text-sm text-slate-200">
              <span>{label(TYPES, s.type)} · {label(FREQUENCIES, s.cronExpression)}{!s.enabled && <span className="text-slate-500"> (متوقف)</span>}</span>
              <span className="flex gap-1">
                <button aria-label={s.enabled ? 'توقف' : 'ادامه'} title={s.enabled ? 'توقف' : 'ادامه'} onClick={() => toggle(s)} className="p-1.5 rounded hover:bg-surface-3/50 text-slate-400">{s.enabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}</button>
                <button aria-label="حذف" title="حذف" onClick={() => remove(s)} className="p-1.5 rounded hover:bg-surface-3/50 text-slate-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
