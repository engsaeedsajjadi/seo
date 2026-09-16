import {
  Radio, AlertCircle, MessageSquare, CheckCircle2,
  HelpCircle, Zap, ExternalLink, Search
} from 'lucide-react';
import { useAppState } from '../lib/store';

export default function AEO() {
  const { state } = useAppState();
  const aiConfigured = state.providerStatus.openai === 'connected' || state.providerStatus.anthropic === 'connected';

  if (!state.currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Radio className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No Project Selected</h2>
        <p className="text-slate-400">Select or create a project for AEO analysis.</p>
      </div>
    );
  }

  if (!aiConfigured) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Answer Engine Optimization</h1>
          <p className="text-sm text-slate-400 mt-1">Optimize for AI answers, featured snippets, and question-based queries</p>
        </div>
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-accent-yellow mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">AI Provider Not Configured</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            AEO analysis requires AI provider access to analyze answer patterns and optimize content for AI-generated responses.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Answer Engine Optimization</h1>
          <p className="text-sm text-slate-400 mt-1">Optimize for AI answers and featured snippets</p>
        </div>
        <button className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
          <Search className="w-4 h-4" /> Analyze Opportunities
        </button>
      </div>

      {/* Question Opportunities */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Question Opportunities</h3>
        <div className="space-y-3">
          {[
            { question: 'What is technical SEO?', coverage: 'partial', opportunity: 'high', featured: true },
            { question: 'How to improve page speed?', coverage: 'none', opportunity: 'high', featured: false },
            { question: 'Best keyword research tools?', coverage: 'partial', opportunity: 'medium', featured: true },
            { question: 'How does Google ranking work?', coverage: 'none', opportunity: 'high', featured: false },
            { question: 'What are core web vitals?', coverage: 'covered', opportunity: 'low', featured: true },
          ].map((q, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-surface/50">
              <HelpCircle className={`w-4 h-4 flex-shrink-0 ${q.coverage === 'none' ? 'text-accent-red' : q.coverage === 'partial' ? 'text-accent-yellow' : 'text-accent-green'}`} />
              <div className="flex-1">
                <p className="text-sm text-white">{q.question}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${q.coverage === 'none' ? 'bg-red-500/20 text-red-400' : q.coverage === 'partial' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
                    {q.coverage}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${q.opportunity === 'high' ? 'bg-brand-500/20 text-brand-400' : 'bg-slate-500/20 text-slate-400'}`}>
                    {q.opportunity} opportunity
                  </span>
                  {q.featured && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-purple/20 text-accent-purple">Featured Snippet</span>}
                </div>
              </div>
              <button className="px-3 py-1.5 bg-brand-600/20 text-brand-400 text-xs rounded-lg hover:bg-brand-600/30">
                Optimize
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Structured Data Coverage */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">FAQ Schema Coverage</h3>
          <div className="space-y-2">
            {[
              { type: 'FAQ', detected: 4, valid: 3, invalid: 1, pages: 12 },
              { type: 'HowTo', detected: 2, valid: 2, invalid: 0, pages: 5 },
              { type: 'Article', detected: 8, valid: 6, invalid: 2, pages: 20 },
              { type: 'BreadcrumbList', detected: 15, valid: 15, invalid: 0, pages: 45 },
            ].map((schema, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded bg-surface/50">
                <span className="text-xs text-slate-300">{schema.type}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-accent-green">{schema.valid} valid</span>
                  {schema.invalid > 0 && <span className="text-xs text-accent-red">{schema.invalid} invalid</span>}
                  <span className="text-xs text-slate-500">{schema.pages} pages</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Entity Signals</h3>
          <div className="space-y-3">
            {[
              { signal: 'Knowledge Graph presence', status: 'detected', strength: 'strong' },
              { signal: 'SameAs markup', status: 'detected', strength: 'medium' },
              { signal: 'Author entity', status: 'missing', strength: 'none' },
              { signal: 'Organization schema', status: 'detected', strength: 'strong' },
              { signal: 'Brand mentions in corpus', status: 'detected', strength: 'medium' },
            ].map((entity, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-xs text-slate-300">{entity.signal}</span>
                <div className="flex items-center gap-2">
                  {entity.status === 'detected' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-accent-green" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-accent-red" />
                  )}
                  <span className={`text-[10px] ${entity.strength === 'strong' ? 'text-accent-green' : entity.strength === 'medium' ? 'text-accent-yellow' : 'text-accent-red'}`}>
                    {entity.strength}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
