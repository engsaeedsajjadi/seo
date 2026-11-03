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

async function handleConnectGoogle() {
  const result = await api.getGoogleConnectUrl();
  if (result.success) {
    window.location.href = result.data.url;
  } else {
    window.alert('اتصال گوگل هنوز فعال نشده است.');
  }
}

async function handleDisconnectGoogle() {
  const result = await api.disconnectGoogle();
  if (result.success) {
    window.location.reload();
  } else {
    window.alert(result.error.message || 'قطع اتصال گوگل انجام نشد.');
  }
}

export default function Integrations() {
  const { state } = useAppState();

  const integrations: Integration[] = [
    { key: 'dataForSeo', name: 'DataForSEO', description: 'خارج از ایران. برای ایران از ورود فایل و سرچ کنسول استفاده کنید. دادهٔ نتایج جست‌وجو، کلمات کلیدی، رتبه، بک‌لینک و رقبا', category: 'data', status: state.providerStatus.dataForSeo, envVars: ['DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD'], icon: Search },
    { key: 'openai', name: 'OpenAI', description: 'تولید و تحلیل محتوا', category: 'ai', status: state.providerStatus.openai, envVars: ['OPENAI_API_KEY'], icon: Bot },
    { key: 'anthropic', name: 'Anthropic', description: 'تولید و تحلیل پیشرفتهٔ محتوا', category: 'ai', status: state.providerStatus.anthropic, envVars: ['ANTHROPIC_API_KEY'], icon: Bot },
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
                        onClick={handleConnectGoogle}
                        className="flex-1 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" /> اتصال به گوگل
                      </button>
                    )}
                    {(integration.key === 'googleSearchConsole' || integration.key === 'googleAnalytics') && integration.status === 'connected' && (
                      <button
                        onClick={handleDisconnectGoogle}
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
