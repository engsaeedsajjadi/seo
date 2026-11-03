import { authenticatedFetch } from '../lib/api';
import { useState, useEffect } from 'react';
import { t } from '../i18n';
import { formatDateOnly } from '../lib/labels';
import { toPersianDigits, formatPersianDate, formatPersianNumber, formatCurrency, formatRelativePersianTime } from '../lib/persian';
import {
  Shield, Key, Code, ExternalLink, Copy, CheckCircle2,
  AlertCircle, Book, Terminal, Zap, RefreshCw, Trash2
} from 'lucide-react';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt?: string;
}

interface Webhook {
  id: string;
  url: string;
  events: string[] | string;
  status: string;
  secretPrefix: string;
  createdAt: string;
  lastTriggeredAt?: string;
}

export default function ApiPage() {
  const [activeTab, setActiveTab] = useState<'rest' | 'mcp' | 'webhooks'>('rest');
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [loadingWebhooks, setLoadingWebhooks] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState('read');
  const [newKeyResult, setNewKeyResult] = useState<{ key: string; id: string } | null>(null);
  const [keyLoading, setKeyLoading] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState('crawl.completed,rank.updated');
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [webhookSuccess, setWebhookSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadKeys() {
      try {
        const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/api-keys`, { credentials: 'include' });
        const json = await res.json();
        if (json.success) setApiKeys(json.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingKeys(false);
      }
    }
    async function loadWebhooks() {
      try {
        const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/webhooks`, { credentials: 'include' });
        const json = await res.json();
        if (json.success) setWebhooks(json.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingWebhooks(false);
      }
    }
    loadKeys();
    loadWebhooks();
  }, []);

  async function handleCreateKey() {
    if (!newKeyName.trim()) {
      setKeyError('Name required');
      return;
    }
    setKeyLoading(true);
    setKeyError(null);
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/api-keys`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim(), scopes: newKeyScopes.split(',').map(s => s.trim()) }),
      });
      const json = await res.json();
      if (json.success) {
        setApiKeys(prev => [json.data, ...prev]);
        setNewKeyResult({ key: json.data.key, id: json.data.id });
        setNewKeyName('');
        setKeyError(null);
      } else {
        setKeyError(json.error?.message || 'انجام نشد');
      }
    } catch (e) {
      setKeyError(e instanceof Error ? e.message : String(e));
    } finally {
      setKeyLoading(false);
    }
  }

  async function handleRevokeKey(id: string) {
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/api-keys/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (json.success) {
        setApiKeys(prev => prev.filter(k => k.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleCreateWebhook() {
    if (!webhookUrl.trim()) {
      setWebhookError('URL required');
      return;
    }
    setWebhookLoading(true);
    setWebhookError(null);
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/webhooks`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl.trim(), events: webhookEvents.split(',').map(s => s.trim()) }),
      });
      const json = await res.json();
      if (json.success) {
        setWebhooks(prev => [json.data, ...prev]);
        setWebhookSuccess(`Webhook created: ${json.data.id} — secret ${json.data.secretPrefix}... shown once, HMAC-SHA256 signed delivery, retry/backoff, SSRF protected`);
        setWebhookUrl('');
        setWebhookError(null);
      } else {
        setWebhookError(json.error?.message || 'انجام نشد');
      }
    } catch (e) {
      setWebhookError(e instanceof Error ? e.message : String(e));
    } finally {
      setWebhookLoading(false);
    }
  }

  async function handleDeleteWebhook(id: string) {
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/webhooks/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (json.success) {
        setWebhooks(prev => prev.filter(w => w.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleTestWebhook(id: string) {
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/webhooks/${encodeURIComponent(id)}/test`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json();
      if (json.success) {
        setWebhookSuccess('ارسال آزمایشی در صف قرار گرفت.');
      }
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">API و MCP</h1>
          <p className="text-sm text-slate-400 mt-1">دسترسی برنامه‌نویسی با کلید API، سرور MCP و وب‌هوک‌های امضاشده</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-surface-2 border border-surface-3/50 rounded-lg p-1 w-fit">
        {(['rest', 'mcp', 'webhooks'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              activeTab === tab ? 'bg-brand-600/20 text-brand-400' : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab === 'rest' ? 'REST API' : tab === 'mcp' ? 'سرور MCP' : 'وب‌هوک‌ها'}
          </button>
        ))}
      </div>

      {activeTab === 'rest' && (
        <div className="space-y-6">
          {/* API Keys */}
          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">کلیدهای API</h3>
              <div className="flex items-center gap-2">
                <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="کلید اصلی" className="px-3 py-1.5 bg-surface border border-surface-3/50 rounded-lg text-xs text-white placeholder-slate-500" />
                <input value={newKeyScopes} onChange={e => setNewKeyScopes(e.target.value)} placeholder="read,write" className="px-3 py-1.5 bg-surface border border-surface-3/50 rounded-lg text-xs text-white placeholder-slate-500 w-24" />
                <button onClick={handleCreateKey} disabled={keyLoading} className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-lg flex items-center gap-1 disabled:opacity-50">
                  {keyLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Key className="w-3 h-3" />} ساخت کلید
                </button>
              </div>
            </div>
            {keyError && <p className="text-xs text-accent-red mb-3">{keyError}</p>}
            {newKeyResult && (
              <div className="bg-accent-green/20 border border-accent-green/30 rounded-lg p-3 mb-4">
                <div className="space-y-2"><p className="text-xs text-accent-green">این کلید فقط همین یک بار نمایش داده می‌شود. آن را در جای امنی نگه دارید.</p><code dir="ltr" className="block text-right text-xs text-white font-mono break-all">{newKeyResult.key}</code></div>
              </div>
            )}
            {loadingKeys ? (
              <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
            ) : apiKeys.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">هنوز کلید API نساخته‌اید.</p>
            ) : (
              <div className="space-y-3">
                {apiKeys.map((apiKey) => (
                  <div key={apiKey.id} className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-white font-medium">{apiKey.name}</p>
                        {apiKey.scopes.map(s => (
                          <span key={s} className="px-1.5 py-0.5 rounded text-[10px] bg-brand-500/20 text-brand-400">{s}</span>
                        ))}
                      </div>
                      <p className="text-xs text-slate-400 mt-1 font-mono"><span dir="ltr">{apiKey.keyPrefix}...</span> · ساخته‌شده: {formatDateOnly(apiKey.createdAt)} · آخرین استفاده: {apiKey.lastUsedAt ? formatDateOnly(apiKey.lastUsedAt) : 'هنوز استفاده نشده'}</p>
                    </div>
                    <button onClick={() => handleRevokeKey(apiKey.id)} className="p-1.5 rounded hover:bg-surface-3/50 text-accent-red text-xs flex items-center gap-1"><Trash2 className="w-3 h-3" /> لغو</button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-500 mt-3">کلید کامل فقط هنگام ساخت نمایش داده می‌شود؛ آن را در جای امنی نگه دارید.</p>
          </div>

          {/* API Endpoints */}
          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">مسیرهای API</h3>
            <div className="space-y-2">
              {[
                { method: 'GET', path: '/api/v1/projects', desc: 'فهرست پروژه‌ها' },
                { method: 'POST', path: '/api/v1/projects', desc: 'ایجاد پروژه' },
                { method: 'GET', path: '/api/v1/projects/:id/audit', desc: 'نتایج ممیزی' },
                { method: 'POST', path: '/api/v1/projects/:id/crawl', desc: 'شروع خزش سایت' },
                { method: 'GET', path: '/api/v1/projects/:id/keywords', desc: 'فهرست کلمات کلیدی' },
                { method: 'POST', path: '/api/v1/projects/:id/keywords', desc: 'افزودن کلمات کلیدی' },
                { method: 'GET', path: '/api/v1/projects/:id/rankings', desc: 'دریافت رتبه‌ها' },
                { method: 'GET', path: '/api/v1/projects/:id/competitors', desc: 'فهرست رقبا' },
                { method: 'GET', path: '/api/v1/projects/:id/backlinks', desc: 'فهرست بک‌لینک‌ها' },
                { method: 'POST', path: '/api/v1/projects/:id/reports', desc: 'تهیهٔ گزارش' },
                { method: 'GET', path: '/api/v1/projects/:id/alerts', desc: 'هشدارها' },
                { method: 'POST', path: '/api/v1/webhooks', desc: 'ایجاد وب‌هوک' },
                { method: 'GET', path: '/api/v1/openapi.json', desc: 'مشخصات OpenAPI' },
                { method: 'GET', path: '/api/v1/gdpr/export', desc: 'خروجی داده‌های کاربر' },
              ].map((endpoint, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-3/20">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                    endpoint.method === 'GET' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {endpoint.method}
                  </span>
                  <code dir="ltr" className="text-xs text-slate-300 font-mono flex-1 text-right break-all">{endpoint.path}</code>
                  <span className="text-xs text-slate-500">{endpoint.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'mcp' && (
        <div className="space-y-6">
          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <Terminal className="w-5 h-5 text-accent-purple" />
              <h3 className="text-sm font-semibold text-white">سرور MCP</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              سرور MCP ابزارهای رنک‌فورج را در اختیار دستیارهای هوش مصنوعی می‌گذارد. هر درخواست تابع مجوزهای سازمان شماست.
            </p>
            <div className="bg-surface rounded-lg p-4 font-mono text-xs text-slate-300 overflow-x-auto mb-4">
              <pre>{`# MCP Server Configuration
{
  "mcpServers": {
    "rankforge": {
      "url": "https://YOUR-MCP-HOST",
      "headers": {
        "Authorization": "Bearer rf_live_..."
      }
    }
  }
}`}</pre>
            </div>
            <h4 className="text-xs font-semibold text-slate-300 mb-3">ابزارهای موجود</h4>
            <div className="space-y-2">
              {[
                { tool: 'list_projects', desc: 'فهرست پروژه‌های سازمان' },
                { tool: 'run_audit', desc: 'شروع ممیزی سایت' },
                { tool: 'get_audit_results', desc: 'دریافت یافته‌های ممیزی' },
                { tool: 'search_keywords', desc: 'تحقیق کلمات کلیدی' },
                { tool: 'get_rankings', desc: 'دریافت رتبه‌های فعلی' },
                { tool: 'analyze_competitors', desc: 'مقایسه با رقبا' },
                { tool: 'generate_report', desc: 'تهیهٔ گزارش سئو' },
                { tool: 'get_gsc_data', desc: 'دریافت دادهٔ سرچ کنسول' },
                { tool: 'check_ai_visibility', desc: 'بررسی دیده‌شدن برند در پاسخ‌های هوش مصنوعی' },
                { tool: 'list_backlinks', desc: 'فهرست بک‌لینک‌ها' },
              ].map((mcpTool, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-surface/50">
                  <Code className="w-3.5 h-3.5 text-accent-purple flex-shrink-0" />
                  <code className="text-xs text-brand-400 font-mono">{mcpTool.tool}</code>
                  <span className="text-xs text-slate-400">{mcpTool.desc}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-3"></p>
          </div>
        </div>
      )}

      {activeTab === 'webhooks' && (
        <div className="space-y-6">
          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">وب‌هوک‌های خروجی</h3>
              <div className="flex items-center gap-2">
                <input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://hooks.example.com/rankforge" className="px-3 py-1.5 bg-surface border border-surface-3/50 rounded-lg text-xs text-white placeholder-slate-500 w-64" />
                <input value={webhookEvents} onChange={e => setWebhookEvents(e.target.value)} placeholder="crawl.completed,rank.updated" className="px-3 py-1.5 bg-surface border border-surface-3/50 rounded-lg text-xs text-white placeholder-slate-500 w-48" />
                <button onClick={handleCreateWebhook} disabled={webhookLoading} className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-lg flex items-center gap-1 disabled:opacity-50">
                  {webhookLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : null} افزودن
                </button>
              </div>
            </div>
            {webhookError && <p className="text-xs text-accent-red mb-3">{webhookError}</p>}
            {webhookSuccess && <p className="text-xs text-accent-green mb-3">{webhookSuccess}</p>}
            <p className="text-xs text-slate-400 mb-4">
              هنگام رخ‌دادن رویدادها اعلان دریافت کنید. هر ارسال در هدر X-RankForge-Signature با HMAC-SHA256 امضا می‌شود؛ کلید امضا، هش SHA-256 کلید مخفی شماست. ارسال ناموفق تا ۵ بار تکرار می‌شود.
            </p>
            {loadingWebhooks ? (
              <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
            ) : webhooks.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">هنوز وب‌هوکی نساخته‌اید.</p>
            ) : (
              <div className="space-y-3">
                {webhooks.map((webhook) => (
                  <div key={webhook.id} className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
                    <div>
                      <p className="text-xs text-white font-mono">{webhook.url}</p>
                      <div className="flex items-center gap-1 mt-1">
                        {(Array.isArray(webhook.events) ? webhook.events : JSON.parse(webhook.events as any || '[]')).map((e: string) => (
                          <span key={e} className="px-1.5 py-0.5 rounded text-[10px] bg-surface-3/50 text-slate-400">{e}</span>
                        ))}
                        <span className="text-[10px] text-slate-500">کلید مخفی {webhook.secretPrefix}...</span>
                        <span className="text-[10px] text-slate-500">وضعیت {webhook.status}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleTestWebhook(webhook.id)} className="px-2 py-1 bg-surface-3/50 text-slate-300 text-[10px] rounded hover:bg-surface-3">آزمایش</button>
                      <button onClick={() => handleDeleteWebhook(webhook.id)} className="p-1.5 rounded hover:bg-surface-3/50 text-accent-red"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-500 mt-3">نشانی‌های داخلی و خصوصی پذیرفته نمی‌شوند. کلید مخفی فقط هنگام ساخت نمایش داده می‌شود.</p>
          </div>

          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">رویدادهای موجود</h3>
            <div className="grid grid-cols-2 gap-2">
              {['crawl.completed', 'audit.completed', 'rank.updated', 'report.generated', 'job.failed'].map(event => (
                <div key={event} className="flex items-center gap-2 p-2 rounded bg-surface/50">
                  <Zap className="w-3 h-3 text-accent-yellow" />
                  <code className="text-xs text-slate-300 font-mono">{event}</code>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
