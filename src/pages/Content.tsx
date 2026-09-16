import { useState } from 'react';
import {
  FileText, Plus, Bot, Sparkles, AlertCircle, ExternalLink,
  CheckCircle2, Clock, RefreshCw, ArrowRight
} from 'lucide-react';
import { useAppState } from '../lib/store';

export default function Content() {
  const { state } = useAppState();
  const [showCreateBrief, setShowCreateBrief] = useState(false);
  const aiConfigured = state.providerStatus.openai === 'connected' || state.providerStatus.anthropic === 'connected';

  if (!state.currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <FileText className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No Project Selected</h2>
        <p className="text-slate-400">Select or create a project to manage content.</p>
      </div>
    );
  }

  if (!aiConfigured) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Content Engine</h1>
          <p className="text-sm text-slate-400 mt-1">AI-assisted content creation and optimization</p>
        </div>
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-accent-yellow mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">AI Provider Not Configured</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
            Content generation requires an AI provider (OpenAI, Anthropic, etc.) to be configured.
            All AI operations are metered and consume credits.
          </p>
          <div className="bg-surface/50 rounded-lg p-4 max-w-sm mx-auto text-left">
            <p className="text-xs font-semibold text-slate-300 mb-2">Supported Providers:</p>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>• OPENAI_API_KEY (GPT-4, GPT-4o)</li>
              <li>• ANTHROPIC_API_KEY (Claude)</li>
              <li>• GOOGLE_AI_API_KEY (Gemini)</li>
              <li>• OPENROUTER_API_KEY (multi-model)</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Content Engine</h1>
          <p className="text-sm text-slate-400 mt-1">AI-assisted content creation and optimization</p>
        </div>
        <button onClick={() => setShowCreateBrief(true)} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Create Content Brief
        </button>
      </div>

      {/* Content Briefs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { title: 'Complete Guide to Technical SEO', status: 'ready', keywords: 8, wordTarget: 3000, created: '2 days ago' },
          { title: 'How to Build a Backlink Strategy', status: 'draft', keywords: 5, wordTarget: 2500, created: '5 days ago' },
          { title: 'SEO Tools Comparison 2024', status: 'ready', keywords: 12, wordTarget: 4000, created: '1 week ago' },
          { title: 'Core Web Vitals Optimization', status: 'in_progress', keywords: 6, wordTarget: 2000, created: '3 days ago' },
        ].map((brief, i) => (
          <div key={i} className="bg-surface-2 border border-surface-3/50 rounded-xl p-5 hover:border-brand-600/30 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-white">{brief.title}</h3>
                <p className="text-xs text-slate-400 mt-1">{brief.keywords} target keywords · {brief.wordTarget} words</p>
              </div>
              <StatusBadge status={brief.status} />
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button className="flex-1 px-3 py-1.5 bg-brand-600/20 text-brand-400 text-xs rounded-lg hover:bg-brand-600/30 flex items-center justify-center gap-1">
                <Bot className="w-3 h-3" /> Generate Outline
              </button>
              <button className="flex-1 px-3 py-1.5 bg-surface-3/30 text-slate-300 text-xs rounded-lg hover:bg-surface-3/50 flex items-center justify-center gap-1">
                <FileText className="w-3 h-3" /> View Brief
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-3">Created {brief.created}</p>
          </div>
        ))}
      </div>

      {/* Content Optimization Suggestions */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Content Optimization Suggestions</h3>
        <div className="space-y-3">
          {[
            { page: '/blog/seo-guide', suggestion: 'Add FAQ section targeting "what is technical seo" (featured snippet opportunity)', type: 'FAQ' },
            { page: '/tools', suggestion: 'Improve heading structure — H2 tags missing target keywords', type: 'Headings' },
            { page: '/blog/backlinks', suggestion: 'Content is 800 words below target. Expand with case studies.', type: 'Content Gap' },
            { page: '/audit', suggestion: 'Add internal links to /tools and /keywords pages', type: 'Internal Links' },
          ].map((opt, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-surface/50 hover:bg-surface-3/30">
              <Sparkles className="w-4 h-4 text-accent-purple mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-slate-400 font-mono">{opt.page}</p>
                <p className="text-sm text-slate-200 mt-0.5">{opt.suggestion}</p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] bg-accent-purple/20 text-accent-purple">{opt.type}</span>
            </div>
          ))}
        </div>
      </div>

      {showCreateBrief && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface-2 border border-surface-3/50 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Create Content Brief</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Target Keyword / Topic</label>
                <input type="text" placeholder="e.g., technical seo audit guide" className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Content Type</label>
                <select className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white">
                  <option>Blog Post</option>
                  <option>Landing Page</option>
                  <option>Product Page</option>
                  <option>Guide</option>
                  <option>FAQ Page</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Target Word Count</label>
                <input type="number" defaultValue={2000} className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white" />
              </div>
              <div className="bg-surface/50 rounded-lg p-3">
                <p className="text-xs text-slate-400">
                  <Bot className="w-3.5 h-3.5 inline mr-1 text-accent-purple" />
                  AI will analyze SERP results, competitor content, and your existing pages to create an optimized brief.
                  This consumes ~2000 tokens (1 credit).
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowCreateBrief(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
              <button onClick={() => setShowCreateBrief(false)} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Generate Brief
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ready: 'bg-green-500/20 text-green-400',
    draft: 'bg-slate-500/20 text-slate-400',
    in_progress: 'bg-brand-500/20 text-brand-400',
  };
  const labels: Record<string, string> = {
    ready: 'Ready',
    draft: 'Draft',
    in_progress: 'In Progress',
  };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${styles[status]}`}>{labels[status]}</span>;
}
