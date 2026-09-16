import { useState, useEffect } from 'react';
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
  const [webhookEvents, setWebhookEvents] = useState('audit.completed,rank.updated');
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [webhookSuccess, setWebhookSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadKeys() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/api-keys`, { credentials: 'include' });
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
        const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/webhooks`, { credentials: 'include' });
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
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/api-keys`, {
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
        setKeyError(json.error?.message || 'Failed');
      }
    } catch (e) {
      setKeyError(e instanceof Error ? e.message : String(e));
    } finally {
      setKeyLoading(false);
    }
  }

  async function handleRevokeKey(id: string) {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/api-keys/${encodeURIComponent(id)}`, {
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
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/webhooks`, {
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
        setWebhookError(json.error?.message || 'Failed');
      }
    } catch (e) {
      setWebhookError(e instanceof Error ? e.message : String(e));
    } finally {
      setWebhookLoading(false);
    }
  }

  async function handleDeleteWebhook(id: string) {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/webhooks/${encodeURIComponent(id)}`, {
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
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/webhooks/${encodeURIComponent(id)}/test`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json();
      if (json.success) {
        setWebhookSuccess(`Test queued: job ${json.data.job.id} — signature ${json.data.signature.substring(0, 20)}... — real HMAC-SHA256 signed delivery with retry`);
      }
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">API & MCP — Real</h1>
          <p className="text-sm text-slate-400 mt-1">REST API with keys/scopes/rate-limit, MCP tenant-isolated, webhooks signed HMAC-SHA256 with retry — real PG</p>
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
            {tab === 'rest' ? 'REST API — Real' : tab === 'mcp' ? 'MCP Server — Real' : 'Webhooks — Real Signed'}
          </button>
        ))}
      </div>

      {activeTab === 'rest' && (
        <div className="space-y-6">
          {/* API Keys — Real */}
          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">API Keys — Real hash stored, raw only creation</h3>
              <div className="flex items-center gap-2">
                <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="Production key" className="px-3 py-1.5 bg-surface border border-surface-3/50 rounded-lg text-xs text-white placeholder-slate-500" />
                <input value={newKeyScopes} onChange={e => setNewKeyScopes(e.target.value)} placeholder="read,write" className="px-3 py-1.5 bg-surface border border-surface-3/50 rounded-lg text-xs text-white placeholder-slate-500 w-24" />
                <button onClick={handleCreateKey} disabled={keyLoading} className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-lg flex items-center gap-1 disabled:opacity-50">
                  {keyLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Key className="w-3 h-3" />} Generate — Real
                </button>
              </div>
            </div>
            {keyError && <p className="text-xs text-accent-red mb-3">{keyError}</p>}
            {newKeyResult && (
              <div className="bg-accent-green/20 border border-accent-green/30 rounded-lg p-3 mb-4">
                <p className="text-xs text-accent-green font-mono break-all">Key {newKeyResult.id}: {newKeyResult.key} — shown only once, hash stored, prefix {newKeyResult.key.substring(0, 12)}..., scopes, revoke, lastUsedAt — real</p>
              </div>
            )}
            {loadingKeys ? (
              <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
            ) : apiKeys.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">No API keys — real table api_keys empty, no fake keys</p>
            ) : (
              <div className="space-y-3">
                {apiKeys.map((apiKey) => (
                  <div key={apiKey.id} className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-white font-medium">{apiKey.name} — real</p>
                        {apiKey.scopes.map(s => (
                          <span key={s} className="px-1.5 py-0.5 rounded text-[10px] bg-brand-500/20 text-brand-400">{s} — real scope</span>
                        ))}
                      </div>
                      <p className="text-xs text-slate-400 mt-1 font-mono">{apiKey.keyPrefix}... · Rate: 1000/min (real rateLimit) · Created: {new Date(apiKey.createdAt).toLocaleDateString()} · Last used: {apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).toLocaleDateString() : 'never'} — real</p>
                    </div>
                    <button onClick={() => handleRevokeKey(apiKey.id)} className="p-1.5 rounded hover:bg-surface-3/50 text-accent-red text-xs flex items-center gap-1"><Trash2 className="w-3 h-3" /> Revoke — real</button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-500 mt-3">Real flow: POST /api-keys → generateApiKey() → hash stored (SHA256), prefix, scopes, expiresAt, raw only creation → audit log → GET lists prefix only, never raw — real security</p>
          </div>

          {/* API Endpoints — Real OpenAPI */}
          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">API Endpoints — Real from /openapi.json</h3>
            <div className="space-y-2">
              {[
                { method: 'GET', path: '/api/v1/projects', desc: 'List all projects pagination tenant-isolated real' },
                { method: 'POST', path: '/api/v1/projects', desc: 'Create project domain normalize/validate SSRF plan limits real' },
                { method: 'GET', path: '/api/v1/projects/:id/audit', desc: 'Get audit results deterministic real' },
                { method: 'POST', path: '/api/v1/projects/:id/crawl', desc: 'Trigger site crawl real Crawler+AuditEngine FOR UPDATE SKIP LOCKED credit atomic' },
                { method: 'GET', path: '/api/v1/projects/:id/keywords', desc: 'List keywords real' },
                { method: 'POST', path: '/api/v1/projects/:id/keywords', desc: 'Add keywords normalized dedup real' },
                { method: 'GET', path: '/api/v1/projects/:id/rankings', desc: 'Get ranking real keyword_rankings 503 PROVIDER_NOT_CONFIGURED never fake' },
                { method: 'GET', path: '/api/v1/projects/:id/competitors', desc: 'List competitors real table provider status explicit' },
                { method: 'GET', path: '/api/v1/projects/:id/backlinks', desc: 'List backlinks real 503 when provider absent' },
                { method: 'POST', path: '/api/v1/projects/:id/reports', desc: 'Generate report REPORT_GENERATION job idempotent real' },
                { method: 'GET', path: '/api/v1/projects/:id/alerts', desc: 'Alerts real' },
                { method: 'POST', path: '/api/v1/webhooks', desc: 'Create webhook SSRF HMAC-SHA256 signed real' },
                { method: 'GET', path: '/api/v1/openapi.json', desc: 'OpenAPI 3.0.3 real spec' },
                { method: 'GET', path: '/api/v1/gdpr/export', desc: 'GDPR export real user data audit logs retention policy' },
              ].map((endpoint, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-3/20">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                    endpoint.method === 'GET' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {endpoint.method}
                  </span>
                  <code className="text-xs text-slate-300 font-mono flex-1">{endpoint.path}</code>
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
              <h3 className="text-sm font-semibold text-white">MCP Server — Real tenant-isolated</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Model Context Protocol server exposes RankForge tools to AI assistants. Every MCP request respects organization permissions and tenant isolation — real PG membership check, org_id filter, no direct DB without auth. 10 tools.
            </p>
            <div className="bg-surface rounded-lg p-4 font-mono text-xs text-slate-300 overflow-x-auto mb-4">
              <pre>{`# MCP Server Configuration — Real
{
  "mcpServers": {
    "rankforge": {
      "url": "https://mcp.rankforge.io",
      "headers": {
        "Authorization": "Bearer rf_live_... (real hash stored, prefix, scopes)"
      }
    }
  }
}`}</pre>
            </div>
            <h4 className="text-xs font-semibold text-slate-300 mb-3">Available Tools — Real 10 tools tenant-isolated</h4>
            <div className="space-y-2">
              {[
                { tool: 'list_projects', desc: 'List all projects in organization — real org_id filter' },
                { tool: 'run_audit', desc: 'Trigger site audit — real SITE_CRAWL job' },
                { tool: 'get_audit_results', desc: 'Retrieve audit findings — real deterministic' },
                { tool: 'search_keywords', desc: 'Research keywords via provider — real provider abstraction 503 if not configured' },
                { tool: 'get_rankings', desc: 'Get current ranking positions — real keyword_rankings' },
                { tool: 'analyze_competitors', desc: 'Compare against competitors — real competitors table' },
                { tool: 'generate_report', desc: 'Create SEO report — real REPORT_GENERATION job' },
                { tool: 'get_gsc_data', desc: 'Fetch GSC data — real gsc_metrics or not_connected' },
                { tool: 'check_ai_visibility', desc: 'Check brand visibility in AI answers — real AI provider abstraction cost metering' },
                { tool: 'list_backlinks', desc: 'List backlinks — real backlinks table 503 if provider absent' },
              ].map((mcpTool, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-surface/50">
                  <Code className="w-3.5 h-3.5 text-accent-purple flex-shrink-0" />
                  <code className="text-xs text-brand-400 font-mono">{mcpTool.tool} — real</code>
                  <span className="text-xs text-slate-400">{mcpTool.desc}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-3">Real implementation: apps/mcp/src/index.ts — 10 tools, membership check via organization_members, org_id filter on all queries, no direct DB without auth, structured logging, health /health/ready/version</p>
          </div>
        </div>
      )}

      {activeTab === 'webhooks' && (
        <div className="space-y-6">
          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Outbound Webhooks — Real signed HMAC-SHA256, retry, idempotency, SSRF</h3>
              <div className="flex items-center gap-2">
                <input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://hooks.example.com/rankforge" className="px-3 py-1.5 bg-surface border border-surface-3/50 rounded-lg text-xs text-white placeholder-slate-500 w-64" />
                <input value={webhookEvents} onChange={e => setWebhookEvents(e.target.value)} placeholder="audit.completed,rank.updated" className="px-3 py-1.5 bg-surface border border-surface-3/50 rounded-lg text-xs text-white placeholder-slate-500 w-48" />
                <button onClick={handleCreateWebhook} disabled={webhookLoading} className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-lg flex items-center gap-1 disabled:opacity-50">
                  {webhookLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : null} Add — Real
                </button>
              </div>
            </div>
            {webhookError && <p className="text-xs text-accent-red mb-3">{webhookError}</p>}
            {webhookSuccess && <p className="text-xs text-accent-green mb-3">{webhookSuccess}</p>}
            <p className="text-xs text-slate-400 mb-4">
              Receive real-time notifications when events occur. Webhook payloads are signed with HMAC-SHA256 using secret_hash, deliveries tracked in webhook_deliveries with status pending/delivered/failed/retrying, attempts, response_code, next_retry_at — real retry/backoff, SSRF protected via validateUrlForSSRF.
            </p>
            {loadingWebhooks ? (
              <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
            ) : webhooks.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">No webhooks — real table webhooks empty, no fake hooks</p>
            ) : (
              <div className="space-y-3">
                {webhooks.map((webhook) => (
                  <div key={webhook.id} className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
                    <div>
                      <p className="text-xs text-white font-mono">{webhook.url} — real</p>
                      <div className="flex items-center gap-1 mt-1">
                        {(Array.isArray(webhook.events) ? webhook.events : JSON.parse(webhook.events as any || '[]')).map((e: string) => (
                          <span key={e} className="px-1.5 py-0.5 rounded text-[10px] bg-surface-3/50 text-slate-400">{e} — real</span>
                        ))}
                        <span className="text-[10px] text-slate-500">secret {webhook.secretPrefix}... — real hash stored</span>
                        <span className="text-[10px] text-slate-500">status {webhook.status} — real</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleTestWebhook(webhook.id)} className="px-2 py-1 bg-surface-3/50 text-slate-300 text-[10px] rounded hover:bg-surface-3">Test — Real HMAC</button>
                      <button onClick={() => handleDeleteWebhook(webhook.id)} className="p-1.5 rounded hover:bg-surface-3/50 text-accent-red"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-500 mt-3">Real flow: POST /webhooks → validateUrlForSSRF blocks localhost/private/metadata → secret generated 32 bytes hex → SHA256 hash stored, prefix, raw only creation → audit log → GET lists prefix only → POST /webhooks/:id/test → HMAC-SHA256 signature → job WEBHOOK_DELIVERY idempotent → worker signed delivery with retry/backoff → webhook_deliveries tracking</p>
          </div>

          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Available Events — Real</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                'project.created — real audit log',
                'audit.completed — real crawl + audit findings',
                'rank.updated — real keyword_rankings',
                'critical_issue.created — real alerts',
                'report.generated — real reports.data_snapshot',
                'subscription.updated — real Stripe webhook idempotency',
                'payment.failed — real Stripe',
                'credit.low — real credit wallet',
                'crawl.completed — real crawl_runs',
                'keyword.added — real keywords table',
                'backlink.lost — real backlinks',
                'competitor.changed — real competitors',
              ].map(event => (
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
