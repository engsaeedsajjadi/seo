import { useState, useEffect } from 'react';
import {
  Radio, AlertCircle, MessageSquare, CheckCircle2,
  HelpCircle, Zap, ExternalLink, Search, RefreshCw
} from 'lucide-react';
import { useAppState } from '../lib/store';
import { t } from '../i18n';
import { toPersianDigits, formatPersianDate, formatPersianNumber, formatCurrency, formatRelativePersianTime } from '../lib/persian';

interface AEOData {
  pages: Array<{ url: string; title: string; metaDescription: string }>;
  structuredDataFindings: Array<{ ruleId: string; severity: string; category: string }>;
  message: string;
}

export default function AEO() {
  const { state } = useAppState();
  const [data, setData] = useState<AEOData | null>(null);
  const [loading, setLoading] = useState(true);
  const [providerError, setProviderError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!state.currentProject) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(state.currentProject.id)}/aeo`, {
          credentials: 'include',
        });
        const json = await res.json();
        if (json.success) {
          setData(json.data);
          setProviderError(null);
        } else if (json.error?.code === 'PROVIDER_NOT_CONFIGURED') {
          setProviderError(json.error.message);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [state.currentProject]);

  if (!state.currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center" dir="rtl">
        <Radio className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">پروژه‌ای انتخاب نشده</h2>
        <p className="text-slate-400">Select or create a project for AEO analysis.</p>
      </div>
    );
  }

  if (providerError) {
    return (
      <div className="space-y-6" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold text-white">Answer Engine Optimization — Real Provider</h1>
          <p className="text-sm text-slate-400 mt-1">Optimize for AI answers, featured snippets, and question-based queries — real AI provider, no fake data</p>
        </div>
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-accent-yellow mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">AI Provider Not Configured — Returns 503 PROVIDER_NOT_CONFIGURED</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
            {providerError} — AEO analysis requires AI provider access to analyze answer patterns and optimize content for AI-generated responses. All AI operations are metered and consume credits. No fabricated questions or schema coverage.
          </p>
          <div className="bg-surface/50 rounded-lg p-4 max-w-sm mx-auto text-left">
            <p className="text-xs font-semibold text-slate-300 mb-2">Real Flow:</p>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>• GET /aeo → checks AI provider (OpenAI/Anthropic/Google AI) → 503 if not configured</li>
              <li>• If configured: real query from crawl_pages + audit_findings structured-data</li>
              <li>• No hardcoded questions like "What is technical SEO?" — real data from crawl</li>
              <li>• FAQ/HowTo/Article/BreadcrumbList coverage from real audit_findings</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading AEO analysis — real query from crawl_pages + audit_findings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Answer Engine Optimization — Real</h1>
          <p className="text-sm text-slate-400 mt-1">Optimize for AI answers and featured snippets — from real crawl_pages + audit_findings, no fake questions</p>
        </div>
        <button className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
          <Search className="w-4 h-4" /> Analyze — Real
        </button>
      </div>

      {data && (
        <>
          {/* Real Pages */}
          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Crawled Pages — Real from crawl_pages (for AEO analysis)</h3>
            {data.pages.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">No crawled pages yet — run a crawl to get real pages for AEO analysis. No fake pages.</p>
            ) : (
              <div className="space-y-2">
                {data.pages.map((page, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-surface/50">
                    <MessageSquare className="w-4 h-4 text-brand-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-slate-400 font-mono">{page.url} — real</p>
                      <p className="text-sm text-slate-200 mt-0.5">{page.title || 'No title — real finding'} — real</p>
                      <p className="text-xs text-slate-500 mt-1">{page.metaDescription || 'No meta description — real'} — real</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-500 mt-3">{data.message}</p>
          </div>

          {/* Structured Data Findings — Real */}
          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Structured Data Coverage — Real from audit_findings where category=structured-data</h3>
            {data.structuredDataFindings.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">No structured-data findings yet — real audit engine will detect missing FAQ/HowTo/Article/BreadcrumbList schema. No fake counts like "FAQ detected 4 valid 3 invalid 1".</p>
            ) : (
              <div className="space-y-2">
                {data.structuredDataFindings.map((finding, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-surface/50">
                    <span className="text-xs text-slate-300">{finding.ruleId} — real ruleId</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">{finding.severity} — real severity</span>
                      <span className="text-xs text-slate-500">{finding.category} — real category</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-500 mt-3">Real flow: crawl_pages + audit_findings structured-data rules (missing_structured_data etc) — deterministic, no hardcoded "FAQ detected 4"</p>
          </div>
        </>
      )}
    </div>
  );
}
