import { Link } from 'react-router-dom';
import {
  Globe, Search, BarChart3, Shield, AlertTriangle, TrendingUp,
  TrendingDown, Minus, ArrowRight, Zap, Clock, CheckCircle2,
  XCircle, ExternalLink, Activity
} from 'lucide-react';
import { useAppState } from '../lib/store';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

const visibilityData = [
  { date: 'Jan', visibility: 42 },
  { date: 'Feb', visibility: 45 },
  { date: 'Mar', visibility: 48 },
  { date: 'Apr', visibility: 52 },
  { date: 'May', visibility: 55 },
  { date: 'Jun', visibility: 58 },
  { date: 'Jul', visibility: 61 },
];

const auditCategoryData = [
  { category: 'Technical', score: 72 },
  { category: 'Content', score: 65 },
  { category: 'Performance', score: 81 },
  { category: 'Indexability', score: 88 },
  { category: 'Links', score: 54 },
  { category: 'Schema', score: 43 },
];

export default function Dashboard() {
  const { state } = useAppState();

  const hasProject = state.currentProject !== null;

  if (!hasProject) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">
            SEO performance overview for <span className="text-brand-400">{state.currentProject?.domain}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Last updated: 2 hours ago
          </span>
          <button className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Run Audit
          </button>
        </div>
      </div>

      {/* SEO Score Card */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 bg-gradient-to-br from-brand-600/20 to-brand-800/20 border border-brand-600/30 rounded-xl p-6">
          <p className="text-xs font-medium text-brand-300 uppercase tracking-wider">SEO Score</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-5xl font-bold text-white">67</span>
            <span className="text-sm text-slate-400 mb-2">/100</span>
          </div>
          <div className="mt-3 flex items-center gap-1 text-sm">
            <TrendingUp className="w-4 h-4 text-accent-green" />
            <span className="text-accent-green">+5</span>
            <span className="text-slate-400">vs last month</span>
          </div>
          <Link to="/audit" className="mt-4 inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300">
            View audit details <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <StatCard
          title="Organic Keywords"
          value="1,247"
          change={+124}
          changeLabel="new this month"
          icon={Search}
          link="/keywords"
        />
        <StatCard
          title="Avg. Position"
          value="14.3"
          change={-2.1}
          changeLabel="improved"
          icon={BarChart3}
          link="/rankings"
          positive={true}
        />
        <StatCard
          title="Critical Issues"
          value="8"
          change={-3}
          changeLabel="resolved"
          icon={AlertTriangle}
          link="/audit"
          positive={true}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Visibility Chart */}
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Search Visibility</h3>
            <span className="text-xs text-slate-400">Last 7 months</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={visibilityData}>
              <defs>
                <linearGradient id="visibilityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#e2e8f0' }}
              />
              <Area type="monotone" dataKey="visibility" stroke="#3b82f6" fill="url(#visibilityGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Audit Categories */}
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Audit Categories</h3>
            <Link to="/audit" className="text-xs text-brand-400 hover:text-brand-300">View all →</Link>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={auditCategoryData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 11, fill: '#94a3b8' }} width={80} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#e2e8f0' }}
              />
              <Bar dataKey="score" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity & Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Findings */}
        <div className="lg:col-span-2 bg-surface-2 border border-surface-3/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Recent Audit Findings</h3>
            <Link to="/audit" className="text-xs text-brand-400 hover:text-brand-300">View all →</Link>
          </div>
          <div className="space-y-3">
            {[
              { severity: 'critical', title: 'Missing HTTPS redirect', urls: 1, category: 'Security' },
              { severity: 'high', title: 'Duplicate title tags detected', urls: 12, category: 'Metadata' },
              { severity: 'high', title: 'Pages without meta description', urls: 8, category: 'Metadata' },
              { severity: 'medium', title: 'Images missing alt attributes', urls: 23, category: 'Images' },
              { severity: 'medium', title: 'Slow page load (>3s)', urls: 5, category: 'Performance' },
              { severity: 'low', title: 'Missing structured data', urls: 15, category: 'Structured Data' },
            ].map((finding, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-3/30">
                <SeverityBadge severity={finding.severity} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{finding.title}</p>
                  <p className="text-xs text-slate-500">{finding.category} · {finding.urls} URL{finding.urls > 1 ? 's' : ''}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500" />
              </div>
            ))}
          </div>
        </div>

        {/* Active Jobs */}
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Active Jobs</h3>
            <Link to="/automation" className="text-xs text-brand-400 hover:text-brand-300">View all →</Link>
          </div>
          <div className="space-y-3">
            {[
              { type: 'SITE_CRAWL', status: 'running', progress: '67%' },
              { type: 'RANK_CHECK', status: 'pending', progress: 'Queued' },
              { type: 'GSC_SYNC', status: 'completed', progress: 'Done' },
              { type: 'PAGESPEED_CHECK', status: 'completed', progress: 'Done' },
            ].map((job, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg">
                <JobStatusIcon status={job.status} />
                <div className="flex-1">
                  <p className="text-xs font-medium text-slate-200">{job.type.replace(/_/g, ' ')}</p>
                  <p className="text-[10px] text-slate-500">{job.progress}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Provider Status Banner */}
      <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Integration Status</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {Object.entries(state.providerStatus).map(([key, status]) => (
            <div key={key} className="flex flex-col items-center gap-2 p-3 rounded-lg bg-surface/50">
              <div className={`w-3 h-3 rounded-full ${
                status === 'connected' ? 'bg-accent-green' :
                status === 'error' ? 'bg-accent-red' :
                'bg-accent-yellow'
              }`} />
              <span className="text-[10px] text-slate-400 text-center">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
              <span className={`text-[10px] ${
                status === 'connected' ? 'text-accent-green' :
                status === 'error' ? 'text-accent-red' :
                'text-accent-yellow'
              }`}>
                {status === 'connected' ? 'Active' : 'Setup Required'}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Configure providers in <Link to="/integrations" className="text-brand-400 hover:text-brand-300">Integrations</Link> to enable data collection.
        </p>
      </div>
    </div>
  );
}

function StatCard({ title, value, change, changeLabel, icon: Icon, link, positive }: {
  title: string;
  value: string;
  change: number;
  changeLabel: string;
  icon: React.ElementType;
  link: string;
  positive?: boolean;
}) {
  const isPositive = positive !== undefined ? positive : change > 0;
  return (
    <Link to={link} className="bg-surface-2 border border-surface-3/50 rounded-xl p-5 hover:border-brand-600/30 transition-colors">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</p>
        <Icon className="w-4 h-4 text-slate-500" />
      </div>
      <p className="text-2xl font-bold text-white mt-2">{value}</p>
      <div className="mt-2 flex items-center gap-1 text-xs">
        {isPositive ? (
          <TrendingUp className="w-3 h-3 text-accent-green" />
        ) : (
          <TrendingDown className="w-3 h-3 text-accent-red" />
        )}
        <span className={isPositive ? 'text-accent-green' : 'text-accent-red'}>
          {change > 0 ? '+' : ''}{change}
        </span>
        <span className="text-slate-500">{changeLabel}</span>
      </div>
    </Link>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    notice: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${colors[severity] || colors.notice}`}>
      {severity}
    </span>
  );
}

function JobStatusIcon({ status }: { status: string }) {
  if (status === 'running') return <Activity className="w-4 h-4 text-brand-400 animate-pulse" />;
  if (status === 'completed') return <CheckCircle2 className="w-4 h-4 text-accent-green" />;
  if (status === 'failed') return <XCircle className="w-4 h-4 text-accent-red" />;
  return <Clock className="w-4 h-4 text-slate-400" />;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500/20 to-brand-700/20 border border-brand-600/30 flex items-center justify-center mb-6">
        <Globe className="w-10 h-10 text-brand-400" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Welcome to RankForge</h2>
      <p className="text-slate-400 max-w-md mb-6">
        Create your first project to start monitoring your website's SEO performance, 
        track rankings, and automate your SEO workflow.
      </p>
      <div className="flex items-center gap-3">
        <Link
          to="/projects"
          className="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg flex items-center gap-2"
        >
          <Globe className="w-4 h-4" />
          Create Project
        </Link>
        <Link
          to="/integrations"
          className="px-6 py-3 bg-surface-3/50 hover:bg-surface-3 text-white font-medium rounded-lg flex items-center gap-2"
        >
          <ExternalLink className="w-4 h-4" />
          Configure Providers
        </Link>
      </div>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl">
        {[
          { step: '1', title: 'Create Project', desc: 'Add your website domain and configure settings' },
          { step: '2', title: 'Run Initial Audit', desc: 'Crawl your site and identify SEO issues' },
          { step: '3', title: 'Track & Optimize', desc: 'Monitor rankings and improve your SEO' },
        ].map(item => (
          <div key={item.step} className="bg-surface-2 border border-surface-3/50 rounded-xl p-4 text-left">
            <div className="w-8 h-8 rounded-lg bg-brand-600/20 flex items-center justify-center text-brand-400 font-bold text-sm mb-3">
              {item.step}
            </div>
            <h4 className="text-sm font-semibold text-white">{item.title}</h4>
            <p className="text-xs text-slate-400 mt-1">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
