import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Wand2, Download, Copy, Check, CheckCircle2, XCircle, Undo2, RotateCcw, RefreshCw,
  AlertCircle, Plug, Sparkles, FileText, Image as ImageIcon, Type,
} from 'lucide-react';
import { authenticatedFetch } from '../lib/api';
import { useAppState } from '../lib/store';
import { apiMessage, formatDateTime, hasAiProvider } from '../lib/labels';
import { toPersianDigits } from '../lib/persian';

interface SiteFix {
  id: string;
  kind: 'meta_title' | 'meta_description' | 'image_alt';
  pageUrl: string;
  target: string | null;
  currentValue: string | null;
  proposedValue: string;
  status: 'proposed' | 'approved' | 'applied' | 'rejected' | 'rollback_requested' | 'rolled_back' | 'failed';
  source: 'ai' | 'plugin' | 'rule';
  previousValue: string | null;
  error: string | null;
  appliedAt: string | null;
  updatedAt: string;
}

interface PluginInfo { seenAt: string | null; version: string | null }

const API = `${import.meta.env.VITE_API_URL || ''}/api/v1`;
// Same limits as the API.
const LIMITS: Record<SiteFix['kind'], number> = { meta_title: 65, meta_description: 165, image_alt: 150 };
const KIND: Record<SiteFix['kind'], { label: string; icon: typeof Type }> = {
  meta_title: { label: 'عنوان صفحه', icon: Type },
  meta_description: { label: 'توضیحات متا', icon: FileText },
  image_alt: { label: 'متن جایگزین تصویر', icon: ImageIcon },
};
const STATUS: Record<SiteFix['status'], { label: string; tone: string }> = {
  proposed: { label: 'منتظر تأیید شما', tone: 'bg-brand-500/15 text-brand-300' },
  approved: { label: 'در صف اعمال روی سایت', tone: 'bg-accent-yellow/15 text-accent-yellow' },
  applied: { label: 'روی سایت اعمال شد', tone: 'bg-accent-green/15 text-accent-green' },
  rejected: { label: 'ردشده', tone: 'bg-slate-500/20 text-slate-400' },
  rollback_requested: { label: 'در صف بازگردانی', tone: 'bg-accent-yellow/15 text-accent-yellow' },
  rolled_back: { label: 'بازگردانده شد', tone: 'bg-slate-500/20 text-slate-300' },
  failed: { label: 'اعمال نشد', tone: 'bg-accent-red/15 text-accent-red' },
};
const TABS = [
  { id: 'review', label: 'منتظر تأیید', statuses: ['proposed'] },
  { id: 'queue', label: 'در صف', statuses: ['approved', 'rollback_requested'] },
  { id: 'applied', label: 'اعمال‌شده', statuses: ['applied'] },
  { id: 'other', label: 'ناموفق و ردشده', statuses: ['failed', 'rejected', 'rolled_back'] },
] as const;

const ERRORS: Record<string, string> = {
  CRAWL_REQUIRED: 'اول یک خزش کامل از سایت انجام دهید تا صفحه‌ها برای پیشنهاد آماده باشند.',
  ALREADY_RUNNING: 'پیشنهادها در حال آماده‌شدن است. چند لحظه صبر کنید.',
  PROVIDER_NOT_CONFIGURED: 'سرویس هوش مصنوعی هنوز فعال نشده است.',
  LIMIT_REACHED: 'سهمیهٔ ماهانهٔ هوش مصنوعی این طرح تمام شده است.',
  FIX_CONFLICT: 'برای همین بخش از صفحه یک تغییر باز دیگر وجود دارد. اول آن را تعیین تکلیف کنید.',
  INVALID_STATE: 'وضعیت این مورد تغییر کرده است. صفحه به‌روز شد.',
  FORBIDDEN: 'نقش شما اجازهٔ تغییر سایت را ندارد. از مدیر سازمان بخواهید.',
  VALIDATION_ERROR: 'متن واردشده معتبر نیست. طول را رعایت کنید و از علامت‌های < و > استفاده نکنید.',
};

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return decodeURIComponent(u.pathname + u.search) || '/';
  } catch {
    return url;
  }
}

/** The plugin checks in every five minutes, so a gap of 15 minutes means the site is not reaching us. */
function pluginState(plugin: PluginInfo | null): 'never' | 'connected' | 'stale' {
  if (!plugin?.seenAt) return 'never';
  return Date.now() - new Date(plugin.seenAt).getTime() < 15 * 60 * 1000 ? 'connected' : 'stale';
}

export default function SiteFixes() {
  const { state } = useAppState();
  const project = state.currentProject;
  const [fixes, setFixes] = useState<SiteFix[]>([]);
  const [plugin, setPlugin] = useState<PluginInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('review');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [writingUntil, setWritingUntil] = useState(0);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!project) return;
    try {
      const res = await authenticatedFetch(`${API}/projects/${encodeURIComponent(project.id)}/fixes`, { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        setFixes(json.data.fixes);
        setPlugin(json.data.plugin);
      } else {
        setMessage({ tone: 'error', text: ERRORS[json.error?.code] ?? apiMessage(json.error?.message) });
      }
    } catch {
      setMessage({ tone: 'error', text: 'ارتباط با سرور برقرار نشد.' });
    } finally {
      setLoading(false);
    }
  }, [project]);

  useEffect(() => { setLoading(true); void load(); }, [load]);

  // Keep the list current while suggestions are written or the plugin works through the queue.
  const waiting = fixes.some((f) => f.status === 'approved' || f.status === 'rollback_requested');
  useEffect(() => {
    if (!waiting && writingUntil < Date.now()) return;
    const timer = setInterval(() => {
      if (writingUntil && writingUntil < Date.now()) setWritingUntil(0);
      void load();
    }, 6000);
    return () => clearInterval(timer);
  }, [waiting, writingUntil, load]);

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, fixes.filter((f) => (t.statuses as readonly string[]).includes(f.status)).length])), [fixes]);
  const visible = fixes.filter((f) => (TABS.find((t) => t.id === tab)!.statuses as readonly string[]).includes(f.status));

  async function suggest() {
    if (!project) return;
    setMessage(null);
    setBusy((b) => ({ ...b, suggest: true }));
    try {
      const res = await authenticatedFetch(`${API}/projects/${encodeURIComponent(project.id)}/fixes/suggest`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      const json = await res.json();
      if (json.success || json.error?.code === 'ALREADY_RUNNING') {
        setWritingUntil(Date.now() + 3 * 60 * 1000);
        setMessage({ tone: 'ok', text: 'پیشنهادها در حال نوشتن است. معمولاً کمتر از یک دقیقه طول می‌کشد و همین‌جا نمایش داده می‌شود.' });
        setTab('review');
      } else {
        setMessage({ tone: 'error', text: ERRORS[json.error?.code] ?? apiMessage(json.error?.message) });
      }
    } catch {
      setMessage({ tone: 'error', text: 'ارتباط با سرور برقرار نشد.' });
    } finally {
      setBusy((b) => ({ ...b, suggest: false }));
    }
  }

  async function act(fix: SiteFix, action: 'approve' | 'reject' | 'rollback' | 'reopen') {
    if (!project) return;
    const draft = drafts[fix.id];
    const body: Record<string, string> = { action };
    if (action === 'approve' && draft !== undefined && draft.trim() !== fix.proposedValue) body.proposedValue = draft.trim();
    setBusy((b) => ({ ...b, [fix.id]: true }));
    setMessage(null);
    try {
      const res = await authenticatedFetch(`${API}/projects/${encodeURIComponent(project.id)}/fixes/${encodeURIComponent(fix.id)}`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setFixes((list) => list.map((f) => (f.id === fix.id ? json.data : f)));
        setDrafts(({ [fix.id]: _removed, ...rest }) => rest);
      } else {
        setMessage({ tone: 'error', text: ERRORS[json.error?.code] ?? apiMessage(json.error?.message) });
        if (json.error?.code === 'INVALID_STATE') void load();
      }
    } catch {
      setMessage({ tone: 'error', text: 'ارتباط با سرور برقرار نشد.' });
    } finally {
      setBusy((b) => ({ ...b, [fix.id]: false }));
    }
  }

  async function approveAll() {
    for (const fix of fixes.filter((f) => f.status === 'proposed')) {
      const value = (drafts[fix.id] ?? fix.proposedValue).trim();
      if (value.length < 1 || value.length > LIMITS[fix.kind] || /[<>]/.test(value)) continue;
      await act(fix, 'approve');
    }
  }

  async function copyProjectId() {
    if (!project) return;
    try {
      await navigator.clipboard.writeText(project.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* the id stays selectable */ }
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Wand2 className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">پروژه‌ای انتخاب نشده</h2>
        <p className="text-slate-400">برای اصلاح خودکار سایت یک پروژه انتخاب کنید.</p>
      </div>
    );
  }

  const connection = pluginState(plugin);
  const aiReady = hasAiProvider(state.providerStatus as unknown as Record<string, unknown>);
  const apiUrl = import.meta.env.VITE_API_URL || window.location.origin;
  const writing = writingUntil > Date.now();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">اصلاح خودکار سایت</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            عنوان صفحه‌ها، توضیحات متا و متن جایگزین تصاویر را بررسی و تأیید کنید تا افزونهٔ وردپرس سئویار آن‌ها را روی سایت بنویسد.
            هیچ تغییری بدون تأیید شما انجام نمی‌شود و هر تغییر قابل بازگشت است.
          </p>
        </div>
        <button
          type="button"
          onClick={suggest}
          disabled={busy.suggest || writing || !aiReady}
          title={aiReady ? undefined : 'سرویس هوش مصنوعی هنوز فعال نشده است'}
          className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-50"
        >
          {busy.suggest || writing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {writing ? 'در حال نوشتن پیشنهادها…' : 'پیشنهاد اصلاح از آخرین خزش'}
        </button>
      </div>

      {!aiReady && (
        <p className="text-xs text-slate-400 -mt-3">پیشنهاد خودکار عنوان و توضیحات به سرویس هوش مصنوعی نیاز دارد که هنوز فعال نشده است. تصاویر بدون متن جایگزین را افزونه بدون هوش مصنوعی پیدا می‌کند.</p>
      )}

      <PluginCard connection={connection} plugin={plugin} projectId={project.id} apiUrl={apiUrl} copied={copied} onCopy={copyProjectId} />

      {message && (
        <div role="status" className={`rounded-xl p-4 text-sm border ${message.tone === 'ok' ? 'bg-accent-green/10 border-accent-green/30 text-accent-green' : 'bg-accent-red/10 border-accent-red/30 text-accent-red'}`}>
          {message.text}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="وضعیت تغییرها" className="flex flex-wrap gap-1 bg-surface-2 border border-surface-3/50 rounded-lg p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-md text-sm ${tab === t.id ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-surface-3/50'}`}
            >
              {t.label} <span className="opacity-70">({toPersianDigits(counts[t.id] ?? 0)})</span>
            </button>
          ))}
        </div>
        {tab === 'review' && counts.review > 1 && (
          <button type="button" onClick={approveAll} className="px-3 py-2 text-sm rounded-lg border border-accent-green/40 text-accent-green hover:bg-accent-green/10 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> تأیید همه ({toPersianDigits(counts.review)})
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState tab={tab} hasAny={fixes.length > 0} />
      ) : (
        <ul className="space-y-3">
          {visible.map((fix) => (
            <FixCard
              key={fix.id}
              fix={fix}
              draft={drafts[fix.id]}
              busy={!!busy[fix.id]}
              onDraft={(value) => setDrafts((d) => ({ ...d, [fix.id]: value }))}
              onAction={(action) => act(fix, action)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PluginCard({ connection, plugin, projectId, apiUrl, copied, onCopy }: {
  connection: 'never' | 'connected' | 'stale'; plugin: PluginInfo | null; projectId: string; apiUrl: string; copied: boolean; onCopy: () => void;
}) {
  const status = {
    connected: { text: 'افزونه وصل است', tone: 'text-accent-green', icon: CheckCircle2 },
    stale: { text: 'افزونه مدتی است با سئویار تماس نگرفته', tone: 'text-accent-yellow', icon: AlertCircle },
    never: { text: 'افزونهٔ وردپرس هنوز وصل نشده', tone: 'text-slate-300', icon: Plug },
  }[connection];
  const Icon = status.icon;
  return (
    <section aria-labelledby="plugin-title" className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Icon className={`w-5 h-5 ${status.tone}`} />
          <div>
            <h2 id="plugin-title" className={`text-sm font-semibold ${status.tone}`}>{status.text}</h2>
            {plugin?.seenAt && (
              <p className="text-xs text-slate-400 mt-0.5">
                آخرین تماس: {formatDateTime(plugin.seenAt)}{plugin.version ? ` · نسخهٔ ${toPersianDigits(plugin.version)}` : ''}
              </p>
            )}
          </div>
        </div>
        <a href="./downloads/seoyar.zip" download className="px-3 py-2 text-sm rounded-lg bg-surface border border-surface-3/50 text-white hover:border-brand-600/50 flex items-center gap-2">
          <Download className="w-4 h-4" /> دانلود افزونهٔ وردپرس
        </a>
      </div>
      <details className="mt-4 group" open={connection === 'never'}>
        <summary className="cursor-pointer text-sm text-brand-400">راهنمای نصب</summary>
        <ol className="mt-3 space-y-2 text-sm text-slate-300 list-decimal pr-5">
          <li>فایل افزونه را دانلود کنید و در وردپرس از «افزونه‌ها › افزودن › بارگذاری افزونه» نصب و فعال کنید.</li>
          <li>
            در صفحهٔ <Link to="/api" className="text-brand-400 underline">API و MCP</Link> یک کلید با دسترسی «خواندن و نوشتن» بسازید.
          </li>
          <li>در وردپرس به «تنظیمات › سئویار» بروید و این مقادیر را وارد کنید:</li>
        </ol>
        <dl className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr] text-sm">
          <dt className="text-slate-400">نشانی سئویار</dt>
          <dd dir="ltr" className="font-mono text-xs text-white bg-surface rounded px-2 py-1.5 break-all text-left">{apiUrl}</dd>
          <dt className="text-slate-400">شناسهٔ پروژه</dt>
          <dd className="flex items-center gap-2">
            <span dir="ltr" className="font-mono text-xs text-white bg-surface rounded px-2 py-1.5 break-all text-left flex-1">{projectId}</span>
            <button type="button" onClick={onCopy} aria-label="کپی شناسهٔ پروژه" className="p-2 rounded-lg hover:bg-surface-3/50 text-slate-300">
              {copied ? <Check className="w-4 h-4 text-accent-green" /> : <Copy className="w-4 h-4" />}
            </button>
          </dd>
        </dl>
        <p className="mt-3 text-xs text-slate-400">
          افزونه هر ۵ دقیقه تغییرهای تأییدشده را اعمال می‌کند و اگر Yoast یا Rank Math نصب باشد، عنوان و توضیحات را در همان‌ها می‌نویسد.
          نشانی سئویار باید با https باشد.
        </p>
      </details>
    </section>
  );
}

function FixCard({ fix, draft, busy, onDraft, onAction }: {
  fix: SiteFix; draft: string | undefined; busy: boolean;
  onDraft: (value: string) => void; onAction: (action: 'approve' | 'reject' | 'rollback' | 'reopen') => void;
}) {
  const kind = KIND[fix.kind];
  const KindIcon = kind.icon;
  const status = STATUS[fix.status];
  const editable = fix.status === 'proposed' || fix.status === 'failed' || fix.status === 'rejected';
  const value = draft ?? fix.proposedValue;
  const limit = LIMITS[fix.kind];
  const tooLong = value.trim().length > limit;
  const invalid = value.trim().length === 0 || tooLong || /[<>]/.test(value);
  const before = fix.status === 'applied' || fix.status === 'rolled_back' ? fix.previousValue : fix.currentValue;
  const fieldId = `fix-${fix.id}`;
  return (
    <li className="bg-surface-2 border border-surface-3/50 rounded-xl p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            <KindIcon className="w-4 h-4 text-brand-400 flex-shrink-0" /> {kind.label}
          </p>
          <a href={fix.pageUrl} target="_blank" rel="noopener noreferrer" dir="ltr" className="block text-xs text-slate-400 hover:text-brand-400 mt-1 truncate max-w-[70vw] sm:max-w-xl text-right">
            {pathOf(fix.pageUrl)}
          </a>
          {fix.target && (
            <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[70vw] sm:max-w-xl">تصویر: <span dir="ltr">{pathOf(fix.target).split('/').pop()}</span></p>
          )}
        </div>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${status.tone}`}>{status.label}</span>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <p className="text-xs text-slate-400 mb-1">{fix.status === 'applied' || fix.status === 'rolled_back' ? 'قبل از تغییر' : 'الان روی سایت'}</p>
          <p className="text-sm text-slate-300 bg-surface rounded-lg px-3 py-2 min-h-[2.5rem]">{before ? before : <span className="text-slate-500">خالی</span>}</p>
        </div>
        <div>
          <label htmlFor={fieldId} className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>{fix.status === 'applied' ? 'نوشته‌شده روی سایت' : 'پیشنهاد'}</span>
            {editable && <span className={tooLong ? 'text-accent-red' : ''}>{toPersianDigits(value.trim().length)} / {toPersianDigits(limit)}</span>}
          </label>
          {editable ? (
            <textarea
              id={fieldId}
              value={value}
              onChange={(e) => onDraft(e.target.value)}
              rows={fix.kind === 'meta_description' ? 3 : 2}
              className={`w-full px-3 py-2 bg-surface border rounded-lg text-sm text-white focus:outline-none ${tooLong ? 'border-accent-red/60' : 'border-surface-3/50 focus:border-brand-600/50'}`}
            />
          ) : (
            <p id={fieldId} className="text-sm text-white bg-surface rounded-lg px-3 py-2 min-h-[2.5rem]">{fix.proposedValue}</p>
          )}
        </div>
      </div>

      {fix.status === 'failed' && fix.error && (
        <p className="mt-3 text-xs text-accent-red flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> علت: {fix.error}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">
          {fix.source === 'plugin' ? 'پیدا شده توسط افزونه' : fix.source === 'ai' ? 'پیشنهاد هوش مصنوعی' : 'پیشنهاد سیستم'}
          {fix.appliedAt && fix.status === 'applied' ? ` · اعمال‌شده ${formatDateTime(fix.appliedAt)}` : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          {(fix.status === 'proposed' || fix.status === 'failed' || fix.status === 'rejected') && (
            <button type="button" disabled={busy || invalid} onClick={() => onAction('approve')} className="px-3 py-2 text-sm rounded-lg bg-accent-green/90 hover:bg-accent-green text-white disabled:opacity-40 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> {fix.status === 'failed' ? 'تلاش دوباره' : 'تأیید و اعمال'}
            </button>
          )}
          {(fix.status === 'proposed' || fix.status === 'approved' || fix.status === 'failed') && (
            <button type="button" disabled={busy} onClick={() => onAction('reject')} className="px-3 py-2 text-sm rounded-lg border border-surface-3 text-slate-300 hover:bg-surface-3/50 disabled:opacity-40 flex items-center gap-1.5">
              <XCircle className="w-4 h-4" /> {fix.status === 'approved' ? 'لغو' : 'رد'}
            </button>
          )}
          {fix.status === 'applied' && (
            <button type="button" disabled={busy} onClick={() => onAction('rollback')} className="px-3 py-2 text-sm rounded-lg border border-accent-yellow/40 text-accent-yellow hover:bg-accent-yellow/10 disabled:opacity-40 flex items-center gap-1.5">
              <Undo2 className="w-4 h-4" /> بازگرداندن مقدار قبلی
            </button>
          )}
          {fix.status === 'rolled_back' && (
            <button type="button" disabled={busy} onClick={() => onAction('reopen')} className="px-3 py-2 text-sm rounded-lg border border-surface-3 text-slate-300 hover:bg-surface-3/50 disabled:opacity-40 flex items-center gap-1.5">
              <RotateCcw className="w-4 h-4" /> بررسی دوباره
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function EmptyState({ tab, hasAny }: { tab: string; hasAny: boolean }) {
  const text: Record<string, string> = {
    review: hasAny ? 'پیشنهادی منتظر تأیید نیست.' : 'هنوز پیشنهادی نیست. «پیشنهاد اصلاح از آخرین خزش» را بزنید یا افزونه را نصب کنید تا تصاویر بدون متن جایگزین پیدا شوند.',
    queue: 'تغییری در صف اعمال نیست.',
    applied: 'هنوز تغییری روی سایت اعمال نشده است.',
    other: 'موردی نیست.',
  };
  return (
    <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-10 text-center">
      <Wand2 className="w-10 h-10 text-slate-500 mx-auto mb-3" />
      <p className="text-sm text-slate-400 max-w-md mx-auto">{text[tab]}</p>
    </div>
  );
}
