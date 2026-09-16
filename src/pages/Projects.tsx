import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Globe, Plus, Settings, Trash2, Search, AlertCircle
} from 'lucide-react';
import { useAppState } from '../lib/store';
import { api } from '../lib/api';
import type { Project } from '../lib/types';
import { PLAN_LIMITS } from '../lib/types';
import { getPlanName } from '../lib/store';

export default function Projects() {
  const { state, actions } = useAppState();
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const planLimits = PLAN_LIMITS[state.currentOrg?.plan || 'FREE'];
  const projectCount = state.projects.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-sm text-slate-400 mt-1">
            {projectCount} of {planLimits.projects === -1 ? '∞' : planLimits.projects} projects used ({getPlanName(state.currentOrg?.plan || 'FREE')} plan)
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          disabled={planLimits.projects !== -1 && projectCount >= planLimits.projects}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search projects..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-surface-2 border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50"
        />
      </div>

      {/* Projects Grid */}
      {state.projects.length === 0 ? (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-12 text-center">
          <Globe className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No projects yet</h3>
          <p className="text-sm text-slate-400 mb-4">Create your first project to start tracking SEO performance.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {state.projects
            .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.domain.toLowerCase().includes(searchQuery.toLowerCase()))
            .map(project => (
              <ProjectCard key={project.id} project={project} />
            ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && <CreateProjectModal onClose={() => setShowCreateModal(false)} />}
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5 hover:border-brand-600/30 transition-colors group">
      <div className="flex items-start justify-between mb-3">
        <Link to={`/projects/${project.id}/audit`} className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-600/20 flex items-center justify-center">
            <Globe className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{project.name}</h3>
            <p className="text-xs text-slate-400">{project.domain}</p>
          </div>
        </Link>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Link to={`/projects/${project.id}/settings`} className="p-1.5 rounded hover:bg-surface-3/50 text-slate-400 hover:text-white">
            <Settings className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-surface/50 rounded-lg p-2.5">
          <p className="text-[10px] text-slate-500 uppercase">SEO Score</p>
          <p className="text-lg font-bold text-white">{project.seoScore ?? '—'}</p>
        </div>
        <div className="bg-surface/50 rounded-lg p-2.5">
          <p className="text-[10px] text-slate-500 uppercase">Last Crawl</p>
          <p className="text-xs text-slate-300 mt-1">
            {project.lastCrawlAt ? new Date(project.lastCrawlAt).toLocaleDateString() : 'Never'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <span className="px-2 py-0.5 rounded text-[10px] bg-surface-3/50 text-slate-400">{project.country}</span>
        <span className="px-2 py-0.5 rounded text-[10px] bg-surface-3/50 text-slate-400">{project.language}</span>
        <span className="px-2 py-0.5 rounded text-[10px] bg-surface-3/50 text-slate-400">{project.device}</span>
      </div>

      <div className="flex items-center gap-2">
        <Link
          to={`/projects/${project.id}/audit`}
          className="flex-1 px-3 py-1.5 bg-brand-600/20 hover:bg-brand-600/30 text-brand-400 text-xs font-medium rounded-lg text-center"
        >
          Audit
        </Link>
        <Link
          to={`/projects/${project.id}/keywords`}
          className="flex-1 px-3 py-1.5 bg-surface-3/30 hover:bg-surface-3/50 text-slate-300 text-xs font-medium rounded-lg text-center"
        >
          Keywords
        </Link>
        <Link
          to={`/projects/${project.id}/rankings`}
          className="flex-1 px-3 py-1.5 bg-surface-3/30 hover:bg-surface-3/50 text-slate-300 text-xs font-medium rounded-lg text-center"
        >
          Rankings
        </Link>
      </div>
    </div>
  );
}

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const { actions } = useAppState();
  const [domain, setDomain] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('US');
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validate domain
  const normalizeDomain = (input: string): string => {
    let d = input.trim().toLowerCase();
    d = d.replace(/^https?:\/\//, '');
    d = d.replace(/\/.*$/, '');
    d = d.replace(/^www\./, '');
    return d;
  };

  const isValidDomain = (d: string): boolean => {
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(d);
  };

  const handleCreate = async () => {
    setError(null);

    // Validation
    if (!name.trim()) {
      setError('Project name is required.');
      return;
    }
    
    const normalizedDomain = normalizeDomain(domain);
    if (!normalizedDomain) {
      setError('Domain is required.');
      return;
    }
    if (!isValidDomain(normalizedDomain)) {
      setError('Please enter a valid domain (e.g., example.com).');
      return;
    }

    setLoading(true);

    // Call API to create project
    const result = await api.createProject({
      name: name.trim(),
      domain: normalizedDomain,
      country,
      language,
    });

    setLoading(false);

    if (result.success) {
      // Update local state with new project
      actions.addProject(result.data);
      onClose();
    } else {
      // Show error from API
      setError(result.error.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-surface-2 border border-surface-3/50 rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">Create New Project</h2>

        <div className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-accent-red/10 border border-accent-red/20">
              <p className="text-xs text-accent-red">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My Website"
              className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Domain</label>
            <input
              type="text"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="example.com"
              className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Country</label>
              <select
                value={country}
                onChange={e => setCountry(e.target.value)}
                className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white focus:outline-none focus:border-brand-600/50"
              >
                <option value="US">United States</option>
                <option value="GB">United Kingdom</option>
                <option value="DE">Germany</option>
                <option value="FR">France</option>
                <option value="JP">Japan</option>
                <option value="BR">Brazil</option>
                <option value="IN">India</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Language</label>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white focus:outline-none focus:border-brand-600/50"
              >
                <option value="en">English</option>
                <option value="de">German</option>
                <option value="fr">French</option>
                <option value="es">Spanish</option>
                <option value="ja">Japanese</option>
                <option value="pt">Portuguese</option>
              </select>
            </div>
          </div>

          <div className="bg-surface/50 border border-surface-3/30 rounded-lg p-3">
            <p className="text-xs text-slate-400">
              <AlertCircle className="w-3.5 h-3.5 inline mr-1 text-accent-yellow" />
              SEO data (keywords, rankings, backlinks) requires provider configuration. 
              Configure in <Link to="/integrations" className="text-brand-400">Integrations</Link>.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
          >
            {loading ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}
