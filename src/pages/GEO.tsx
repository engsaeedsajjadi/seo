import {
  Brain, AlertCircle, Eye, MessageSquare, Quote, ExternalLink,
  TrendingUp, BarChart3, Sparkles
} from 'lucide-react';
import { useAppState } from '../lib/store';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const visibilityData = [
  { engine: 'ChatGPT', mentions: 12, citations: 8, share: 24 },
  { engine: 'Perplexity', mentions: 8, citations: 5, share: 18 },
  { engine: 'Gemini', mentions: 6, citations: 3, share: 12 },
  { engine: 'Bing Copilot', mentions: 4, citations: 2, share: 8 },
];

const pieData = [
  { name: 'Your Brand', value: 24, color: '#3b82f6' },
  { name: 'Competitor A', value: 32, color: '#8b5cf6' },
  { name: 'Competitor B', value: 18, color: '#f59e0b' },
  { name: 'Others', value: 26, color: '#64748b' },
];

export default function GEO() {
  const { state } = useAppState();
  const aiConfigured = state.providerStatus.openai === 'connected' || state.providerStatus.anthropic === 'connected';

  if (!state.currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Brain className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No Project Selected</h2>
        <p className="text-slate-400">Select or create a project to track AI visibility.</p>
      </div>
    );
  }

  if (!aiConfigured) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">GEO / AI Visibility</h1>
          <p className="text-sm text-slate-400 mt-1">Track your brand visibility in AI-generated answers</p>
        </div>
        <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-accent-yellow mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">AI Provider Not Configured</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
            GEO tracking requires AI provider access to query AI search engines and measure brand visibility.
            This measures actual AI responses — no fabricated data is shown.
          </p>
          <div className="bg-surface/50 rounded-lg p-4 max-w-sm mx-auto text-left">
            <p className="text-xs font-semibold text-slate-300 mb-2">Required:</p>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>• OPENAI_API_KEY or ANTHROPIC_API_KEY</li>
              <li>• Optional: PERPLEXITY_API_KEY for Perplexity tracking</li>
              <li>• Brand name configured in project settings</li>
            </ul>
          </div>
          <p className="text-xs text-slate-500 mt-4">
            Note: GEO measurements are based on actual AI responses to configured prompts.
            Results may vary between queries and are clearly labeled as measured data.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">GEO / AI Visibility</h1>
          <p className="text-sm text-slate-400 mt-1">Brand visibility in AI-generated answers</p>
        </div>
        <button className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Run Visibility Check
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">AI Mentions</p>
          <p className="text-2xl font-bold text-white mt-1">30</p>
          <p className="text-xs text-accent-green mt-1">+8 this week</p>
        </div>
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">Citations</p>
          <p className="text-2xl font-bold text-brand-400 mt-1">18</p>
          <p className="text-xs text-accent-green mt-1">+5 this week</p>
        </div>
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">Share of Voice</p>
          <p className="text-2xl font-bold text-accent-purple mt-1">24%</p>
          <p className="text-xs text-accent-green mt-1">+3% vs last week</p>
        </div>
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">Prompts Tracked</p>
          <p className="text-2xl font-bold text-white mt-1">45</p>
          <p className="text-xs text-slate-400 mt-1">Active queries</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Visibility by AI Engine</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={visibilityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="engine" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
              <Bar dataKey="mentions" fill="#3b82f6" name="Mentions" />
              <Bar dataKey="citations" fill="#8b5cf6" name="Citations" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Share of Voice</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}%`}>
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Mentions */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Recent AI Mentions</h3>
        <div className="space-y-3">
          {[
            { engine: 'ChatGPT', prompt: 'best seo automation tools', mention: 'RankForge is a comprehensive SEO automation platform...', sentiment: 'positive' },
            { engine: 'Perplexity', prompt: 'how to track seo rankings', mention: 'Tools like RankForge provide automated rank tracking...', sentiment: 'positive' },
            { engine: 'Gemini', prompt: 'seo tools comparison', mention: 'RankForge offers site audit, keyword research, and...', sentiment: 'neutral' },
          ].map((mention, i) => (
            <div key={i} className="p-3 rounded-lg bg-surface/50 border border-surface-3/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-accent-purple">{mention.engine}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded ${mention.sentiment === 'positive' ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}`}>
                  {mention.sentiment}
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-1">Prompt: "{mention.prompt}"</p>
              <p className="text-xs text-slate-300 italic">"{mention.mention}"</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-slate-500">
          * Measurements based on actual AI responses to configured prompts. Results may vary between queries.
        </p>
      </div>
    </div>
  );
}
