import { useState, type ChangeEvent, type ReactNode } from 'react';
import { Upload } from 'lucide-react';
import { authenticatedFetch } from '../lib/api';
import { parseCsv } from '../lib/csv-parse';
import { formatPersianNumber } from '../lib/persian';

const MAX_ROWS = 5000;

/** Imports an export from Search Console or any SEO tool. Needs no external API or account here. */
export default function CsvImport<T>({ title, help, endpoint, toRows, body, onImported, summary }: {
  title: string;
  help: ReactNode;
  endpoint: string;
  toRows: (rows: string[][]) => T[] | null;
  body?: Record<string, unknown>;
  onImported: () => void;
  summary: (data: any) => string;
}) {
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true); setMessage(''); setFailed(false);
    try {
      const rows = toRows(parseCsv(await file.text()));
      if (!rows) throw new Error('ستون‌های لازم در این فایل پیدا نشد. یک خروجی CSV از سرچ کنسول یا ابزار سئو انتخاب کنید.');
      if (rows.length === 0) throw new Error('ردیف معتبری در این فایل نبود.');
      if (rows.length > MAX_ROWS) throw new Error(`هر فایل حداکثر ${formatPersianNumber(MAX_ROWS)} ردیف می‌تواند داشته باشد.`);
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, rows }),
      });
      const json = await res.json();
      if (!json.success) throw new Error('ورود فایل انجام نشد. لطفاً دوباره تلاش کنید.');
      setMessage(summary(json.data));
      onImported();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : 'ورود فایل انجام نشد.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <p className="text-xs text-slate-400 mt-1">{help}</p>
        </div>
        <label className={`px-4 py-2 rounded-lg text-sm text-white bg-brand-600 hover:bg-brand-700 flex items-center gap-2 cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
          <Upload className="w-4 h-4" /> {busy ? 'در حال ورود…' : 'انتخاب فایل CSV'}
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="sr-only" />
        </label>
      </div>
      {message && <p role={failed ? 'alert' : 'status'} className={`text-xs mt-3 ${failed ? 'text-accent-red' : 'text-accent-green'}`}>{message}</p>}
    </div>
  );
}
