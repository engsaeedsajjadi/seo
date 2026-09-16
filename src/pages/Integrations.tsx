import {
  ExternalLink, CheckCircle2, XCircle, Clock, AlertCircle,
  Settings, RefreshCw, Database, Bot, CreditCard, HardDrive, Search
} from 'lucide-react';
import { useAppState, getProviderLabel, getStatusColor, getStatusLabel } from '../lib/store';
import type { ProviderStatus } from '../lib/types';

interface Integration {
  key: string;
  name: string;
  description: string;
  category: 'data' | 'ai' | 'analytics' | 'payments' | 'storage';
  status: ProviderStatus;
  envVars: string[];
  icon: React.ElementType;
}

export default function Integrations() {
  const { state } = useAppState();

  const integrations: Integration[] = [
    { key: 'dataForSeo', name: 'DataForSEO', description: 'SERP data, keywords, rankings, backlinks, competitors', category: 'data', status: state.providerStatus.dataForSeo, envVars: ['DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD'], icon: Search },
    { key: 'openai', name: 'OpenAI', description: 'GPT-4, GPT-4o for content generation and analysis', category: 'ai', status: state.providerStatus.openai, envVars: ['OPENAI_API_KEY'], icon: Bot },
    { key: 'anthropic', name: 'Anthropic', description: 'Claude for advanced content and analysis', category: 'ai', status: state.providerStatus.anthropic, envVars: ['ANTHROPIC_API_KEY'], icon: Bot },
    { key: 'googleSearchConsole', name: 'Google Search Console', description: 'Organic search performance data via OAuth', category: 'analytics', status: state.providerStatus.googleSearchConsole, envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], icon: Search },
    { key: 'googleAnalytics', name: 'Google Analytics 4', description: 'Traffic, sessions, and conversion data', category: 'analytics', status: state.providerStatus.googleAnalytics, envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], icon: Database },
    { key: 'stripe', name: 'Stripe', description: 'Subscription billing and payment processing', category: 'payments', status: state.providerStatus.stripe, envVars: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'], icon: CreditCard },
    { key: 's3', name: 'S3 Storage', description: 'Object storage for reports and exports', category: 'storage', status: state.providerStatus.s3, envVars: ['S3_ENDPOINT', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_BUCKET'], icon: HardDrive },
  ];

  const categories = [
    { key: 'data', label: 'SEO Data Providers', color: 'text-brand-400' },
    { key: 'ai', label: 'AI Providers', color: 'text-accent-purple' },
    { key: 'analytics', label: 'Analytics & Search', color: 'text-accent-green' },
    { key: 'payments', label: 'Billing', color: 'text-accent-yellow' },
    { key: 'storage', label: 'Storage', color: 'text-slate-400' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Integrations</h1>
          <p className="text-sm text-slate-400 mt-1">Configure external providers and services</p>
        </div>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface-2 border border-accent-green/30 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-accent-green" />
          <div>
            <p className="text-lg font-bold text-accent-green">{integrations.filter(i => i.status === 'connected').length}</p>
            <p className="text-xs text-slate-400">Connected</p>
          </div>
        </div>
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 text-accent-yellow" />
          <div>
            <p className="text-lg font-bold text-accent-yellow">{integrations.filter(i => i.status === 'not_configured').length}</p>
            <p className="text-xs text-slate-400">Not Configured</p>
          </div>
        </div>
        <div className="bg-surface-2 border border-accent-red/30 rounded-xl p-4 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-accent-red" />
          <div>
            <p className="text-lg font-bold text-accent-red">{integrations.filter(i => i.status === 'error').length}</p>
            <p className="text-xs text-slate-400">Errors</p>
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

                  <div className="mt-4 bg-surface/50 rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase mb-2">Required Environment Variables</p>
                    <div className="space-y-1">
                      {integration.envVars.map(envVar => (
                        <div key={envVar} className="flex items-center gap-2">
                          <code className="text-[11px] font-mono text-slate-300 bg-surface-3/30 px-1.5 py-0.5 rounded">{envVar}</code>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    {integration.status === 'not_configured' && (
                      <button className="flex-1 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1">
                        <Settings className="w-3 h-3" /> Configure
                      </button>
                    )}
                    {integration.status === 'connected' && (
                      <>
                        <button className="flex-1 px-3 py-2 bg-surface-3/30 hover:bg-surface-3/50 text-slate-300 text-xs font-medium rounded-lg flex items-center justify-center gap-1">
                          <RefreshCw className="w-3 h-3" /> Test Connection
                        </button>
                        <button className="px-3 py-2 bg-surface-3/30 hover:bg-surface-3/50 text-slate-300 text-xs font-medium rounded-lg">
                          <Settings className="w-3 h-3" />
                        </button>
                      </>
                    )}
                    {integration.status === 'error' && (
                      <button className="flex-1 px-3 py-2 bg-accent-red/20 hover:bg-accent-red/30 text-accent-red text-xs font-medium rounded-lg flex items-center justify-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Fix Configuration
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Provider Architecture Note */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-2">Provider Architecture</h3>
        <p className="text-xs text-slate-400 mb-3">
          RankForge uses a provider abstraction layer. Each data type (keywords, SERP, backlinks, AI) has an interface
          that can be implemented by multiple providers. This prevents vendor lock-in and allows switching providers
          without changing application code.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-surface/50 rounded-lg p-3">
            <p className="text-xs font-semibold text-brand-400 mb-1">SerpProvider</p>
            <p className="text-[10px] text-slate-400">DataForSEO → SerpApi → Custom</p>
          </div>
          <div className="bg-surface/50 rounded-lg p-3">
            <p className="text-xs font-semibold text-accent-purple mb-1">AIProvider</p>
            <p className="text-[10px] text-slate-400">OpenAI → Anthropic → Google → OpenRouter</p>
          </div>
          <div className="bg-surface/50 rounded-lg p-3">
            <p className="text-xs font-semibold text-accent-green mb-1">BacklinkProvider</p>
            <p className="text-[10px] text-slate-400">DataForSEO → Custom index</p>
          </div>
        </div>
      </div>
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
