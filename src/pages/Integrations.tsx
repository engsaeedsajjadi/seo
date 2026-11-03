import { useEffect, useState } from 'react';
import {
  ExternalLink, CheckCircle2, XCircle, Clock, AlertCircle,
  Settings, RefreshCw, Database, Bot, CreditCard, HardDrive, Search
} from 'lucide-react';
import { useAppState, getProviderLabel, getStatusColor, getStatusLabel } from '../lib/store';
import { api } from '../lib/api';
import type { ProviderStatus } from '../lib/types';
import { t } from '../i18n';
import { toPersianDigits, formatPersianDate, formatPersianNumber, formatCurrency, formatRelativePersianTime } from '../lib/persian';

interface Integration {
  key: string;
  name: string;
  description: string;
  category: 'data' | 'ai' | 'analytics' | 'payments' | 'storage';
  status: ProviderStatus;
  envVars: string[];
  icon: React.ElementType;
}

async function connectGoogle(onError: (message: string) => void) {
  const result = await api.getGoogleConnectUrl();
  if (result.success) window.location.href = result.data.url;
  else onError('اتصال گوگل هنوز فعال نشده است. با پشتیبانی تماس بگیرید.');
}

async function disconnectGoogle(onError: (message: string) => void) {
  const result = await api.disconnectGoogle();
  if (result.success) window.location.reload();
  else onError('قطع اتصال گوگل انجام نشد.');
}

function GoogleProperties() {
  const { state } = useAppState();
  const project = state.currentProject;
  const [sites, setSites] = useState<{ siteUrl: string }[]>([]);
  const [properties, setProperties] = useState<{ propertyId: string; displayName?: string; propertyName?: string }[]>([]);
  const [site, setSite] = useState('');
  const [property, setProperty] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void api.getGscSites().then((r) => {
      if (!r.success) return;
      setSites(r.data.sites);
      const domain = project?.domain ?? '';
      const match = r.data.sites.find((s) => s.siteUrl.includes(domain));
      setSite(match?.siteUrl ?? r.data.sites[0]?.siteUrl ?? '');
    });
    void api.getGa4Properties().then((r) => {
      if (r.success) { setProperties(r.data.properties); setProperty(r.data.properties[0]?.propertyId ?? ''); }
    });
  }, [project?.domain]);

  async function connect(provider: 'gsc' | 'ga4') {
    if (!project) return;
    setBusy(true); setMessage(null);
    const selected = properties.find((p) => p.propertyId === property);
    const bound = await api.bindGoogleProperty(project.id, provider, provider === 'gsc'
      ? { siteUrl: site }
      : { propertyId: property, propertyName: selected?.displayName ?? selected?.propertyName });
    const synced = bound.success ? await api.syncGoogleProperty(project.id, provider) : bound;
    setMessage(synced.success
      ? { ok: true, text: 'وصل شد و همگام‌سازی در صف قرار گرفت. نتیجه در صفحه‌ی اتوماسیون و رتبه‌بندی دیده می‌شود.' }
      : { ok: false, text: 'وصل‌کردن انجام نشد. دسترسی حساب گوگل به این سایت را بررسی کنید.' });
    setBusy(false);
  }

  if (!project) return <p className="bg-surface-2 border border-surface-3/50 rounded-xl p-5 text-sm text-slate-300">برای انتخاب سایت گوگل، ابتدا یک پروژه باز کنید.</p>;
  const field = 'block w-full mt-1.5 bg-surface border border-surface-3/50 rounded-lg px-3 py-2.5 text-sm text-white';
  const button = 'bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50';
  return (
    <section className="bg-surface-2 border border-surface-3/50 rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-white">داده‌ی گوگل برای {project.domain}</h3>
      {message && <p role="status" className={`text-sm ${message.ok ? 'text-accent-green' : 'text-accent-red'}`}>{message.text}</p>}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <label className="text-sm text-slate-300">سایت در سرچ کنسول
          <select dir="ltr" value={site} onChange={(e) => setSite(e.target.value)} className={field}>
            {sites.length === 0 && <option value="">سایتی در این حساب گوگل پیدا نشد</option>}
            {sites.map((s) => <option key={s.siteUrl} value={s.siteUrl}>{s.siteUrl}</option>)}
          </select>
        </label>
        <button disabled={busy || !site} onClick={() => void connect('gsc')} className={button}>وصل و همگام‌سازی</button>
        <label className="text-sm text-slate-300">پراپرتی آنالیتیکس
          <select dir="ltr" value={property} onChange={(e) => setProperty(e.target.value)} className={field}>
            {properties.length === 0 && <option value="">پراپرتی‌ای در این حساب گوگل پیدا نشد</option>}
            {properties.map((p) => <option key={p.propertyId} value={p.propertyId}>{p.displayName ?? p.propertyName ?? p.propertyId}</option>)}
          </select>
        </label>
        <button disabled={busy || !property} onClick={() => void connect('ga4')} className={button}>وصل و همگام‌سازی</button>
      </div>
    </section>
  );
}

export default function Integrations() {
  const { state } = useAppState();
  const [googleError, setGoogleError] = useState('');
  const googleResult = new URLSearchParams(window.location.hash.split('?')[1] || '').get('google');
  const googleNotice = googleResult === 'connected'
    ? { ok: true, text: 'حساب گوگل وصل شد. حالا سایت پروژه را انتخاب کنید.' }
    : googleResult === 'error'
      ? { ok: false, text: 'اتصال به گوگل کامل نشد. دوباره تلاش کنید.' }
      : null;

  const integrations: Integration[] = [
    { key: 'dataForSeo', name: 'DataForSEO', description: 'خارج از ایران. برای ایران از ورود فایل و سرچ کنسول استفاده کنید. دادهٔ نتایج جست‌وجو، کلمات کلیدی، رتبه، بک‌لینک و رقبا', category: 'data', status: state.providerStatus.dataForSeo, envVars: ['DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD'], icon: Search },
    { key: 'openai', name: 'OpenAI', description: 'تولید و تحلیل محتوا', category: 'ai', status: state.providerStatus.openai, envVars: ['OPENAI_API_KEY'], icon: Bot },
    { key: 'anthropic', name: 'Anthropic', description: 'تولید و تحلیل پیشرفتهٔ محتوا', category: 'ai', status: state.providerStatus.anthropic, envVars: ['ANTHROPIC_API_KEY'], icon: Bot },
    { key: 'google', name: 'Google AI (Gemini)', description: 'تولید و تحلیل محتوا', category: 'ai', status: (state.providerStatus as unknown as Record<string, ProviderStatus>).google ?? 'not_configured', envVars: ['ANTHROPIC_API_KEY'], icon: Bot },
    { key: 'googleSearchConsole', name: 'Google Search Console', description: 'دادهٔ عملکرد جست‌وجوی ارگانیک', category: 'analytics', status: state.providerStatus.googleSearchConsole, envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], icon: Search },
    { key: 'googleAnalytics', name: 'Google Analytics 4', description: 'دادهٔ ترافیک، نشست و تبدیل', category: 'analytics', status: state.providerStatus.googleAnalytics, envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], icon: Database },
  ];

  const categories = [
    { key: 'data', label: 'سرویس‌های دادهٔ سئو', color: 'text-brand-400' },
    { key: 'ai', label: 'سرویس‌های هوش مصنوعی', color: 'text-accent-purple' },
    { key: 'analytics', label: 'تحلیل و جست‌وجو', color: 'text-accent-green' },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">یکپارچه‌سازی‌ها</h1>
          <p className="text-sm text-slate-400 mt-1">وضعیت سرویس‌های خارجی متصل</p>
        </div>
      </div>

      {googleError && <p role="alert" className="bg-accent-red/10 border border-accent-red/30 rounded-xl p-4 text-sm text-accent-red">{googleError}</p>}

      {/* Status Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface-2 border border-accent-green/30 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-accent-green" />
          <div>
            <p className="text-lg font-bold text-accent-green">{integrations.filter(i => i.status === 'connected').length}</p>
            <p className="text-xs text-slate-400">متصل</p>
          </div>
        </div>
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 text-accent-yellow" />
          <div>
            <p className="text-lg font-bold text-accent-yellow">{integrations.filter(i => i.status === 'not_configured').length}</p>
            <p className="text-xs text-slate-400">فعال نشده</p>
          </div>
        </div>
        <div className="bg-surface-2 border border-accent-red/30 rounded-xl p-4 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-accent-red" />
          <div>
            <p className="text-lg font-bold text-accent-red">{integrations.filter(i => i.status === 'error').length}</p>
            <p className="text-xs text-slate-400">خطاها</p>
          </div>
        </div>
      </div>

      {googleNotice && <p role="status" className={`rounded-xl p-4 text-sm border ${googleNotice.ok ? 'bg-accent-green/10 border-accent-green/30 text-accent-green' : 'bg-accent-red/10 border-accent-red/30 text-accent-red'}`}>{googleNotice.text}</p>}

      {state.providerStatus.googleSearchConsole === 'connected' && <GoogleProperties />}

      {/* Integration Cards */}
      {categories.map(category => {
        const categoryIntegrations = integrations.filter(i => i.category === category.key);
        if (categoryIntegrations.length === 0) return null;
        return (
          <div key={category.key}>
            <h3 className={`text-sm font-semibold ${category.color} mb-3`}>{category.label}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categoryIntegrations.map(integration => (
                <div key={integration.key} className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-surface-3/50 flex items-center justify-center">
                        <integration.icon className="w-5 h-5 text-slate-300" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white">{integration.name}</h4>
                        <p className="text-xs text-slate-400">{integration.description}</p>
                      </div>
                    </div>
                    <StatusIndicator status={integration.status} />
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    {(integration.key === 'googleSearchConsole' || integration.key === 'googleAnalytics') && integration.status !== 'connected' && (
                      <button
                        onClick={() => void connectGoogle(setGoogleError)}
                        className="flex-1 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" /> اتصال به گوگل
                      </button>
                    )}
                    {(integration.key === 'googleSearchConsole' || integration.key === 'googleAnalytics') && integration.status === 'connected' && (
                      <button
                        onClick={() => void disconnectGoogle(setGoogleError)}
                        className="flex-1 px-3 py-2 bg-surface-3/30 hover:bg-surface-3/50 text-slate-300 text-xs font-medium rounded-lg flex items-center justify-center gap-1"
                      >
                        <XCircle className="w-3 h-3" /> قطع اتصال گوگل
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusIndicator({ status }: { status: ProviderStatus }) {
  return (
    <div className="flex items-center gap-1.5">
      {status === 'connected' && <CheckCircle2 className="w-4 h-4 text-accent-green" />}
      {status === 'not_configured' && <Clock className="w-4 h-4 text-accent-yellow" />}
      {status === 'error' && <XCircle className="w-4 h-4 text-accent-red" />}
      {status === 'rate_limited' && <AlertCircle className="w-4 h-4 text-accent-purple" />}
      <span className={`text-xs ${getStatusColor(status)}`}>{getStatusLabel(status)}</span>
    </div>
  );
}
