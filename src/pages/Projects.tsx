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
import { t } from '../i18n';
import { toPersianDigits, formatPersianDate, formatRelativePersianTime } from '../lib/persian';

export default function Projects() {
  const { state, actions } = useAppState();
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const planLimits = PLAN_LIMITS[state.currentOrg?.plan || 'FREE'];
  const projectCount = state.projects.length;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-vazirmatn-bold">{t('projects.title')}</h1>
          <p className="text-sm text-slate-400 mt-1 font-vazirmatn-regular">
            {toPersianDigits(projectCount)} از {planLimits.projects === -1 ? '∞' : toPersianDigits(planLimits.projects)} پروژه استفاده شده ({getPlanName(state.currentOrg?.plan || 'FREE')} )
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          disabled={planLimits.projects !== -1 && projectCount >= planLimits.projects}
          aria-label={t('projects.createProject')}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg flex items-center gap-2 font-vazirmatn-medium"
        >
          <Plus className="w-4 h-4" />
          {t('projects.createProject')}
        </button>
      </div>

      {/* Search - RTL */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder={t('projects.searchProjects')}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          aria-label={t('projects.searchProjects')}
          className="w-full pr-10 pl-4 py-2.5 bg-surface-2 border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50 font-vazirmatn-regular"
        />
      </div>

      {/* Projects Grid */}
      {state.projects.length === 0 ? (
        <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-12 text-center">
          <Globe className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2 font-vazirmatn-bold">{t('projects.noProjects')}</h3>
          <p className="text-sm text-slate-400 mb-4 font-vazirmatn-regular">{t('projects.noProjectsDescription')}</p>
          <button
            onClick={() => setShowCreateModal(true)}
            aria-label={t('projects.createFirstProject')}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 font-vazirmatn-medium"
          >
            <Plus className="w-4 h-4" />
            {t('projects.createProject')}
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
    <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5 hover:border-brand-600/30 transition-colors group" dir="rtl">
      <div className="flex items-start justify-between mb-3">
        <Link to={`/projects/${project.id}/audit`} className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-600/20 flex items-center justify-center">
            <Globe className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white font-vazirmatn-bold">{project.name}</h3>
            <p className="text-xs text-slate-400 ltr-content">{project.domain}</p>
          </div>
        </Link>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Link to={`/projects/${project.id}/settings`} aria-label={t('common.settings')} className="p-1.5 rounded hover:bg-surface-3/50 text-slate-400 hover:text-white">
            <Settings className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-surface/50 rounded-lg p-2.5">
          <p className="text-[10px] text-slate-500 uppercase font-vazirmatn-medium">امتیاز سئو</p>
          <p className="text-lg font-bold text-white persian-numbers font-vazirmatn-bold">{project.seoScore ? toPersianDigits(project.seoScore) : '—'}</p>
        </div>
        <div className="bg-surface/50 rounded-lg p-2.5">
          <p className="text-[10px] text-slate-500 uppercase font-vazirmatn-medium">آخرین خزش</p>
          <p className="text-xs text-slate-300 mt-1 font-vazirmatn-light">
            {project.lastCrawlAt ? formatPersianDate(project.lastCrawlAt, { format: 'short' }) : 'هرگز'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <span className="px-2 py-0.5 rounded text-[10px] bg-surface-3/50 text-slate-400 ltr-content">{project.country}</span>
        <span className="px-2 py-0.5 rounded text-[10px] bg-surface-3/50 text-slate-400 ltr-content">{project.language}</span>
        <span className="px-2 py-0.5 rounded text-[10px] bg-surface-3/50 text-slate-400 ltr-content">{project.device}</span>
      </div>

      <div className="flex items-center gap-2">
        <Link
          to={`/projects/${project.id}/audit`}
          className="flex-1 px-3 py-1.5 bg-brand-600/20 hover:bg-brand-600/30 text-brand-400 text-xs font-medium rounded-lg text-center font-vazirmatn-medium"
        >
          ممیزی
        </Link>
        <Link
          to={`/projects/${project.id}/keywords`}
          className="flex-1 px-3 py-1.5 bg-surface-3/30 hover:bg-surface-3/50 text-slate-300 text-xs font-medium rounded-lg text-center font-vazirmatn-medium"
        >
          کلمات کلیدی
        </Link>
        <Link
          to={`/projects/${project.id}/rankings`}
          className="flex-1 px-3 py-1.5 bg-surface-3/30 hover:bg-surface-3/50 text-slate-300 text-xs font-medium rounded-lg text-center font-vazirmatn-medium"
        >
          رتبه‌ها
        </Link>
      </div>
    </div>
  );
}

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const { actions } = useAppState();
  const [domain, setDomain] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('IR');
  const [language, setLanguage] = useState('fa');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    if (!name.trim()) {
      setError(t('validation.nameRequired'));
      return;
    }
    
    const normalizedDomain = normalizeDomain(domain);
    if (!normalizedDomain) {
      setError(t('validation.domainRequired'));
      return;
    }
    if (!isValidDomain(normalizedDomain)) {
      setError(t('validation.domainInvalid'));
      return;
    }

    setLoading(true);

    const result = await api.createProject({
      name: name.trim(),
      domain: normalizedDomain,
      country,
      language,
    });

    setLoading(false);

    if (result.success) {
      actions.addProject(result.data);
      onClose();
    } else {
      setError(result.error.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" dir="rtl">
      <div className="w-full max-w-lg bg-surface-2 border border-surface-3/50 rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-4 font-vazirmatn-bold">{t('projects.createNewProject')}</h2>

        <div className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-accent-red/10 border border-accent-red/20">
              <p className="text-xs text-accent-red font-vazirmatn-regular">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 font-vazirmatn-medium">{t('projects.projectName')}</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('projects.projectNamePlaceholder')}
              aria-label={t('projects.projectName')}
              className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50 font-vazirmatn-regular"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 font-vazirmatn-medium">{t('projects.projectDomain')}</label>
            <input
              type="text"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder={t('projects.projectDomainPlaceholder')}
              aria-label={t('projects.projectDomain')}
              dir="ltr"
              className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50 ltr-content"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 font-vazirmatn-medium">کشور</label>
              <select
                value={country}
                onChange={e => setCountry(e.target.value)}
                aria-label="کشور"
                className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white focus:outline-none focus:border-brand-600/50 font-vazirmatn-regular"
              >
                <option value="IR">ایران</option>
                <option value="US">آمریکا</option>
                <option value="GB">انگلستان</option>
                <option value="DE">آلمان</option>
                <option value="FR">فرانسه</option>
                <option value="TR">ترکیه</option>
                <option value="AE">امارات</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 font-vazirmatn-medium">زبان</label>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                aria-label="زبان"
                className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white focus:outline-none focus:border-brand-600/50 font-vazirmatn-regular"
              >
                <option value="fa">فارسی</option>
                <option value="en">انگلیسی</option>
                <option value="ar">عربی</option>
                <option value="tr">ترکی</option>
              </select>
            </div>
          </div>

          <div className="bg-surface/50 border border-surface-3/30 rounded-lg p-3">
            <p className="text-xs text-slate-400 font-vazirmatn-light">
              <AlertCircle className="w-3.5 h-3.5 inline ml-1 text-accent-yellow" />
              داده‌های سئو (کلمات کلیدی، رتبه‌ها، بک‌لینک) نیاز به پیکربندی سرویس‌دهنده دارد.
              در <Link to="/integrations" className="text-brand-400">یکپارچه‌سازی‌ها</Link> پیکربندی کنید.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={loading}
            aria-label={t('common.cancel')}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-50 font-vazirmatn-regular"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            aria-label={t('projects.createProject')}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg font-vazirmatn-medium"
          >
            {loading ? t('projects.creatingProject') : t('projects.createProject')}
          </button>
        </div>
      </div>
    </div>
  );
}
