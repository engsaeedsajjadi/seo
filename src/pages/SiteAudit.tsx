import { useState } from 'react';
import {
  Shield, AlertTriangle, CheckCircle2, XCircle, Clock, Play,
  ChevronDown, ChevronRight, ExternalLink, Filter, Download,
  ArrowRight, Zap, Globe, AlertCircle
} from 'lucide-react';
import { useAppState } from '../lib/store';
import type { Severity, AuditCategory } from '../lib/types';

interface AuditRule {
  id: string;
  severity: Severity;
  category: AuditCategory;
  title: string;
  description: string;
  affectedCount: number;
  recommendation: string;
  status: 'open' | 'fixed' | 'ignored';
}

const auditRules: AuditRule[] = [
  { id: 'R001', severity: 'critical', category: 'security', title: 'Missing HTTPS redirect', description: 'HTTP version of the site does not redirect to HTTPS', affectedCount: 1, recommendation: 'Configure 301 redirect from HTTP to HTTPS', status: 'open' },
  { id: 'R002', severity: 'critical', category: 'crawlability', title: 'Blocked important resources in robots.txt', description: 'CSS and JS files are blocked from crawling', affectedCount: 3, recommendation: 'Allow crawling of CSS and JS resources', status: 'open' },
  { id: 'R003', severity: 'high', category: 'metadata', title: 'Duplicate title tags', description: 'Multiple pages share the same title tag', affectedCount: 12, recommendation: 'Create unique, descriptive titles for each page', status: 'open' },
  { id: 'R004', severity: 'high', category: 'metadata', title: 'Missing meta descriptions', description: 'Pages without meta description tags', affectedCount: 8, recommendation: 'Add compelling meta descriptions (150-160 chars)', status: 'open' },
  { id: 'R005', severity: 'high', category: 'content', title: 'Thin content pages', description: 'Pages with fewer than 300 words', affectedCount: 6, recommendation: 'Expand content or add noindex to thin pages', status: 'open' },
  { id: 'R006', severity: 'medium', category: 'images', title: 'Images missing alt attributes', description: 'Images without descriptive alt text', affectedCount: 23, recommendation: 'Add descriptive alt text to all images', status: 'open' },
  { id: 'R007', severity: 'medium', category: 'performance', title: 'Slow page load times', description: 'Pages taking more than 3 seconds to load', affectedCount: 5, recommendation: 'Optimize images, enable compression, reduce render-blocking resources', status: 'open' },
  { id: 'R008', severity: 'medium', category: 'links', title: 'Broken internal links', description: 'Internal links pointing to 404 pages', affectedCount: 4, recommendation: 'Fix or remove broken internal links', status: 'open' },
  { id: 'R009', severity: 'medium', category: 'structured-data', title: 'Missing structured data', description: 'Pages without any structured data markup', affectedCount: 15, recommendation: 'Add relevant schema.org markup (Article, Product, etc.)', status: 'open' },
  { id: 'R010', severity: 'low', category: 'international', title: 'Missing hreflang tags', description: 'Multilingual pages without hreflang implementation', affectedCount: 7, recommendation: 'Implement hreflang tags for language targeting', status: 'open' },
  { id: 'R011', severity: 'low', category: 'indexability', title: 'Pages with noindex but linked internally', description: 'Pages marked noindex that receive internal links', affectedCount: 2, recommendation: 'Remove noindex or remove internal links', status: 'open' },
  { id: 'R012', severity: 'notice', category: 'content', title: 'Duplicate content detected', description: 'Similar content found across multiple URLs', affectedCount: 3, recommendation: 'Consolidate or differentiate content', status: 'open' },
];

export default function SiteAudit() {
  const { state } = useAppState();
  const [selectedSeverity, setSelectedSeverity] = useState<Severity | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<AuditCategory | 'all'>('all');
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [showRunCrawl, setShowRunCrawl] = useState(false);

  const hasProject = state.currentProject !== null;

  if (!hasProject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Shield className="w-12 h-12 text-slate-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No Project Selected</h2>
        <p className="text-slate-400">Select or create a project to run a site audit.</p>
      </div>
    );
  }

  const filteredRules = auditRules.filter(r => {
    if (selectedSeverity !== 'all' && r.severity !== selectedSeverity) return false;
    if (selectedCategory !== 'all' && r.category !== selectedCategory) return false;
    return true;
  });

  const severityCounts = {
    critical: auditRules.filter(r => r.severity === 'critical').length,
    high: auditRules.filter(r => r.severity === 'high').length,
    medium: auditRules.filter(r => r.severity === 'medium').length,
    low: auditRules.filter(r => r.severity === 'low').length,
    notice: auditRules.filter(r => r.severity === 'notice').length,
  };

  const overallScore = Math.round(100 - (severityCounts.critical * 10 + severityCounts.high * 5 + severityCounts.medium * 2 + severityCounts.low * 1));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Site Audit</h1>
          <p className="text-sm text-slate-400 mt-1">
            Technical SEO analysis for <span className="text-brand-400">{state.currentProject?.domain}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-surface-3/50 hover:bg-surface-3 text-slate-300 text-sm font-medium rounded-lg flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={() => setShowRunCrawl(true)}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            Run Crawl
          </button>
        </div>
      </div>

      {/* Score Overview */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="md:col-span-1 bg-surface-2 border border-surface-3/50 rounded-xl p-5 flex flex-col items-center justify-center">
          <div className={`text-4xl font-bold ${overallScore >= 80 ? 'text-accent-green' : overallScore >= 60 ? 'text-accent-yellow' : 'text-accent-red'}`}>
            {overallScore}
          </div>
          <p className="text-xs text-slate-400 mt-1">Overall Score</p>
          <p className="text-[10px] text-slate-500 mt-1">Based on {auditRules.length} rules</p>
        </div>
        <SeverityCard severity="critical" count={severityCounts.critical} total={auditRules.length} />
        <SeverityCard severity="high" count={severityCounts.high} total={auditRules.length} />
        <SeverityCard severity="medium" count={severityCounts.medium} total={auditRules.length} />
        <SeverityCard severity="low" count={severityCounts.low} total={auditRules.length} />
        <SeverityCard severity="notice" count={severityCounts.notice} total={auditRules.length} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Filter className="w-4 h-4 text-slate-400" />
        <select
          value={selectedSeverity}
          onChange={e => setSelectedSeverity(e.target.value as Severity | 'all')}
          className="px-3 py-1.5 bg-surface-2 border border-surface-3/50 rounded-lg text-xs text-white focus:outline-none focus:border-brand-600/50"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="notice">Notice</option>
        </select>
        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value as AuditCategory | 'all')}
          className="px-3 py-1.5 bg-surface-2 border border-surface-3/50 rounded-lg text-xs text-white focus:outline-none focus:border-brand-600/50"
        >
          <option value="all">All Categories</option>
          <option value="crawlability">Crawlability</option>
          <option value="indexability">Indexability</option>
          <option value="metadata">Metadata</option>
          <option value="content">Content</option>
          <option value="links">Links</option>
          <option value="images">Images</option>
          <option value="performance">Performance</option>
          <option value="security">Security</option>
          <option value="structured-data">Structured Data</option>
          <option value="international">International SEO</option>
        </select>
        <span className="text-xs text-slate-500 ml-auto">
          Showing {filteredRules.length} of {auditRules.length} findings
        </span>
      </div>

      {/* Findings List */}
      <div className="space-y-2">
        {filteredRules.map(rule => (
          <div key={rule.id} className="bg-surface-2 border border-surface-3/50 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)}
              className="w-full flex items-center gap-4 p-4 hover:bg-surface-3/20 text-left"
            >
              <SeverityIcon severity={rule.severity} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-500">{rule.id}</span>
                  <span className="text-sm font-medium text-white">{rule.title}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{rule.category} · {rule.affectedCount} URL{rule.affectedCount > 1 ? 's' : ''} affected</p>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                rule.status === 'open' ? 'bg-red-500/20 text-red-400' :
                rule.status === 'fixed' ? 'bg-green-500/20 text-green-400' :
                'bg-slate-500/20 text-slate-400'
              }`}>
                {rule.status}
              </span>
              {expandedRule === rule.id ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            </button>

            {expandedRule === rule.id && (
              <div className="px-4 pb-4 border-t border-surface-3/30 pt-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-300 mb-1">Description</h4>
                    <p className="text-xs text-slate-400">{rule.description}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-300 mb-1">Recommendation</h4>
                    <p className="text-xs text-slate-400">{rule.recommendation}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button className="px-3 py-1.5 bg-accent-green/20 text-accent-green text-xs rounded-lg hover:bg-accent-green/30">
                    Mark as Fixed
                  </button>
                  <button className="px-3 py-1.5 bg-surface-3/50 text-slate-300 text-xs rounded-lg hover:bg-surface-3">
                    Ignore
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Run Crawl Modal */}
      {showRunCrawl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface-2 border border-surface-3/50 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-2">Run Site Crawl</h2>
            <p className="text-sm text-slate-400 mb-4">
              This will crawl {state.currentProject?.domain} and analyze SEO issues.
            </p>
            <div className="bg-surface/50 border border-surface-3/30 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-2 text-xs text-accent-yellow">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Crawl consumes credits based on pages discovered.</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs text-slate-400">Max Depth</label>
                <input type="number" defaultValue={5} className="w-full mt-1 px-3 py-2 bg-surface border border-surface-3/50 rounded-lg text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-slate-400">Max Pages</label>
                <input type="number" defaultValue={500} className="w-full mt-1 px-3 py-2 bg-surface border border-surface-3/50 rounded-lg text-sm text-white" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setShowRunCrawl(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
              <button onClick={() => setShowRunCrawl(false)} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Start Crawl
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SeverityCard({ severity, count, total }: { severity: Severity; count: number; total: number }) {
  const colors: Record<Severity, string> = {
    critical: 'border-red-500/30 bg-red-500/5',
    high: 'border-orange-500/30 bg-orange-500/5',
    medium: 'border-yellow-500/30 bg-yellow-500/5',
    low: 'border-blue-500/30 bg-blue-500/5',
    notice: 'border-slate-500/30 bg-slate-500/5',
  };
  const textColors: Record<Severity, string> = {
    critical: 'text-red-400',
    high: 'text-orange-400',
    medium: 'text-yellow-400',
    low: 'text-blue-400',
    notice: 'text-slate-400',
  };
  return (
    <div className={`border rounded-xl p-4 ${colors[severity]}`}>
      <p className={`text-2xl font-bold ${textColors[severity]}`}>{count}</p>
      <p className="text-xs text-slate-400 capitalize mt-1">{severity}</p>
      <div className="mt-2 w-full bg-surface-3/50 rounded-full h-1">
        <div className={`h-1 rounded-full ${textColors[severity].replace('text-', 'bg-')}`} style={{ width: `${(count / total) * 100}%` }} />
      </div>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: Severity }) {
  const icons: Record<Severity, React.ReactNode> = {
    critical: <XCircle className="w-5 h-5 text-red-400" />,
    high: <AlertTriangle className="w-5 h-5 text-orange-400" />,
    medium: <AlertCircle className="w-5 h-5 text-yellow-400" />,
    low: <Clock className="w-5 h-5 text-blue-400" />,
    notice: <CheckCircle2 className="w-5 h-5 text-slate-400" />,
  };
  return <>{icons[severity]}</>;
}
