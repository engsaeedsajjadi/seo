import { useState } from 'react';
import {
  Shield, Key, Code, ExternalLink, Copy, CheckCircle2,
  AlertCircle, Book, Terminal, Zap
} from 'lucide-react';

export default function ApiPage() {
  const [activeTab, setActiveTab] = useState<'rest' | 'mcp' | 'webhooks'>('rest');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">API & MCP</h1>
          <p className="text-sm text-slate-400 mt-1">REST API, MCP server, and webhook configuration</p>
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
            {tab === 'rest' ? 'REST API' : tab === 'mcp' ? 'MCP Server' : 'Webhooks'}
          </button>
        ))}
      </div>

      {activeTab === 'rest' && (
        <div className="space-y-6">
          {/* API Keys */}
          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">API Keys</h3>
              <button className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-lg flex items-center gap-1">
                <Key className="w-3 h-3" /> Generate Key
              </button>
            </div>
            <div className="space-y-3">
              {[
                { name: 'Production', key: 'rf_live_sk_...x8f2', scopes: ['read', 'write'], created: '2024-01-15', rateLimit: '1000/min' },
                { name: 'Development', key: 'rf_test_sk_...b3c1', scopes: ['read'], created: '2024-03-20', rateLimit: '100/min' },
              ].map((apiKey, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-white font-medium">{apiKey.name}</p>
                      {apiKey.scopes.map(s => (
                        <span key={s} className="px-1.5 py-0.5 rounded text-[10px] bg-brand-500/20 text-brand-400">{s}</span>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-1 font-mono">{apiKey.key} · Rate: {apiKey.rateLimit} · Created: {apiKey.created}</p>
                  </div>
                  <button className="p-1.5 rounded hover:bg-surface-3/50 text-accent-red text-xs">Revoke</button>
                </div>
              ))}
            </div>
          </div>

          {/* API Endpoints */}
          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">API Endpoints</h3>
            <div className="space-y-2">
              {[
                { method: 'GET', path: '/api/v1/projects', desc: 'List all projects' },
                { method: 'POST', path: '/api/v1/projects', desc: 'Create a new project' },
                { method: 'GET', path: '/api/v1/projects/:id/audit', desc: 'Get audit results' },
                { method: 'POST', path: '/api/v1/projects/:id/crawl', desc: 'Trigger a site crawl' },
                { method: 'GET', path: '/api/v1/projects/:id/keywords', desc: 'List keywords' },
                { method: 'POST', path: '/api/v1/projects/:id/keywords', desc: 'Add keywords' },
                { method: 'GET', path: '/api/v1/projects/:id/rankings', desc: 'Get ranking data' },
                { method: 'GET', path: '/api/v1/projects/:id/competitors', desc: 'List competitors' },
                { method: 'GET', path: '/api/v1/projects/:id/backlinks', desc: 'List backlinks' },
                { method: 'POST', path: '/api/v1/projects/:id/reports', desc: 'Generate a report' },
                { method: 'GET', path: '/api/v1/organizations/:id/usage', desc: 'Get usage data' },
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

          {/* Code Example */}
          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Example Request</h3>
            <div className="bg-surface rounded-lg p-4 font-mono text-xs text-slate-300 overflow-x-auto">
              <pre>{`curl -X GET https://api.rankforge.io/v1/projects \\
  -H "Authorization: Bearer rf_live_sk_..." \\
  -H "Content-Type: application/json"

# Response
{
  "data": [
    {
      "id": "proj_abc123",
      "name": "My Website",
      "domain": "example.com",
      "seo_score": 67,
      "created_at": "2024-01-15T10:00:00Z"
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "per_page": 20
  }
}`}</pre>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'mcp' && (
        <div className="space-y-6">
          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <Terminal className="w-5 h-5 text-accent-purple" />
              <h3 className="text-sm font-semibold text-white">MCP Server</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              The Model Context Protocol (MCP) server exposes RankForge tools to AI assistants.
              Every MCP request respects organization permissions and tenant isolation.
            </p>
            <div className="bg-surface rounded-lg p-4 font-mono text-xs text-slate-300 overflow-x-auto mb-4">
              <pre>{`# MCP Server Configuration
{
  "mcpServers": {
    "rankforge": {
      "url": "https://mcp.rankforge.io",
      "headers": {
        "Authorization": "Bearer rf_live_sk_..."
      }
    }
  }
}`}</pre>
            </div>
            <h4 className="text-xs font-semibold text-slate-300 mb-3">Available Tools</h4>
            <div className="space-y-2">
              {[
                { tool: 'list_projects', desc: 'List all projects in the organization' },
                { tool: 'run_audit', desc: 'Trigger a site audit for a project' },
                { tool: 'get_audit_results', desc: 'Retrieve audit findings' },
                { tool: 'search_keywords', desc: 'Research keywords via provider' },
                { tool: 'get_rankings', desc: 'Get current ranking positions' },
                { tool: 'analyze_competitors', desc: 'Compare against competitors' },
                { tool: 'generate_report', desc: 'Create an SEO report' },
                { tool: 'get_gsc_data', desc: 'Fetch Google Search Console data' },
                { tool: 'check_ai_visibility', desc: 'Check brand visibility in AI answers' },
              ].map((mcpTool, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-surface/50">
                  <Code className="w-3.5 h-3.5 text-accent-purple flex-shrink-0" />
                  <code className="text-xs text-brand-400 font-mono">{mcpTool.tool}</code>
                  <span className="text-xs text-slate-400">{mcpTool.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'webhooks' && (
        <div className="space-y-6">
          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Outbound Webhooks</h3>
              <button className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-lg">
                Add Webhook
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Receive real-time notifications when events occur. Webhook payloads are signed with HMAC-SHA256.
            </p>
            <div className="space-y-3">
              {[
                { url: 'https://hooks.slack.com/services/...', events: ['audit.completed', 'rank.updated'], active: true },
                { url: 'https://api.myapp.com/webhooks/rankforge', events: ['critical_issue.created', 'report.generated'], active: true },
              ].map((webhook, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
                  <div>
                    <p className="text-xs text-white font-mono">{webhook.url}</p>
                    <div className="flex items-center gap-1 mt-1">
                      {webhook.events.map(e => (
                        <span key={e} className="px-1.5 py-0.5 rounded text-[10px] bg-surface-3/50 text-slate-400">{e}</span>
                      ))}
                    </div>
                  </div>
                  <div className={`w-8 h-4 rounded-full ${webhook.active ? 'bg-accent-green' : 'bg-surface-3'}`}>
                    <div className={`w-3 h-3 rounded-full bg-white mt-0.5 ${webhook.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Available Events</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                'project.created', 'audit.completed', 'rank.updated', 'critical_issue.created',
                'report.generated', 'subscription.updated', 'payment.failed', 'credit.low',
                'crawl.completed', 'keyword.added', 'backlink.lost', 'competitor.changed',
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
