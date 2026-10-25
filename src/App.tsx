import PasswordRecovery from './components/PasswordRecovery';
import { useState, useEffect, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import SiteAudit from './pages/SiteAudit';
import Keywords from './pages/Keywords';
import Rankings from './pages/Rankings';
import Competitors from './pages/Competitors';
import Backlinks from './pages/Backlinks';
import Content from './pages/Content';
import GEO from './pages/GEO';
import AEO from './pages/AEO';
import Reports from './pages/Reports';
import Automation from './pages/Automation';
import Alerts from './pages/Alerts';
import Integrations from './pages/Integrations';
import Billing from './pages/Billing';
import Team from './pages/Team';
import Agency from './pages/Agency';
import ApiPage from './pages/ApiPage';
import SettingsPage from './pages/Settings';
import { AppContext, useAppState } from './lib/store';
import type { AppState, AppActions } from './lib/store';
import type { Organization, Project, ProviderStatus } from './lib/types';
import { api, AUTH_EXPIRED_EVENT } from './lib/api';
import { isApiError, ApiErrorCode } from './lib/api';
import { t } from './i18n';
import { formatPersianNumber, toPersianDigits } from './lib/persian';

type AppStatus = 'loading' | 'no_backend' | 'unauthenticated' | 'ready';

function App() {
  const [status, setStatus] = useState<AppStatus>('loading');
  const [state, setState] = useState<AppState>({
    isAuthenticated: false,
    currentOrg: null,
    currentProject: null,
    projects: [],
    jobs: [],
    alerts: [],
    providerStatus: {
      dataForSeo: 'not_configured',
      openai: 'not_configured',
      anthropic: 'not_configured',
      googleSearchConsole: 'not_configured',
      googleAnalytics: 'not_configured',
      stripe: 'not_configured',
      s3: 'not_configured',
    },
    theme: 'dark',
  });

  const setCurrentProject = useCallback((project: Project | null) => setState(s => ({ ...s, currentProject: project })), []);
  const actions: AppActions = {
    setAuthenticated: (v) => setState(s => ({ ...s, isAuthenticated: v })),
    setCurrentOrg: (org) => setState(s => ({ ...s, currentOrg: org })),
    setCurrentProject,
    addProject: (project) => setState(s => ({ ...s, projects: [...s.projects, project] })),
    dismissAlert: (id) => setState(s => ({ ...s, alerts: s.alerts.filter(a => a.id !== id) })),
  };

  // Refresh data from API
  const refreshData = useCallback(async () => {
    const [orgResult, projectsResult, providerResult] = await Promise.all([
      api.getCurrentOrganization(),
      api.getProjects(),
      api.getProviderStatus(),
    ]);

    setState(s => ({
      ...s,
      currentOrg: orgResult.success ? orgResult.data : null,
      projects: projectsResult.success ? projectsResult.data : [],
      currentProject: projectsResult.success && projectsResult.data.length > 0 ? projectsResult.data[0] : s.currentProject,
      providerStatus: providerResult.success ? providerResult.data : s.providerStatus,
    }));
  }, []);

  useEffect(() => {
    const expired = () => {
      setState(s => ({ ...s, isAuthenticated: false, currentOrg: null, currentProject: null, projects: [], jobs: [], alerts: [] }));
      setStatus('unauthenticated');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, expired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, expired);
  }, []);

  // Initialize app - set RTL and Persian
  useEffect(() => {
    document.documentElement.setAttribute('lang', 'fa');
    document.documentElement.setAttribute('dir', 'rtl');
    document.body.setAttribute('dir', 'rtl');
    
    async function initialize() {
      const available = await api.checkAvailability();
      
      if (!available) {
        setStatus('no_backend');
        return;
      }

      const userResult = await api.getCurrentUser();
      if (!userResult.success) {
        if (isApiError(userResult.error) && 
            (userResult.error.code === ApiErrorCode.UNAUTHENTICATED || 
             userResult.error.code === ApiErrorCode.SESSION_EXPIRED)) {
          setStatus('unauthenticated');
          return;
        }
        setStatus('unauthenticated');
        return;
      }

      await refreshData();
      setState(s => ({ ...s, isAuthenticated: true }));
      setStatus('ready');
    }

    initialize();
  }, [refreshData]);

  if (window.location.hash.startsWith('#/reset-password')) {
    const token=new URLSearchParams(window.location.hash.split('?')[1] || '').get('token') || '';
    return <div className="min-h-screen bg-surface flex items-center justify-center p-6"><div className="bg-surface-2 rounded-xl p-6 max-w-md w-full">
      <PasswordRecovery token={token} onBack={()=>{window.location.hash='';window.location.reload();}} />
    </div></div>;
  }

  // Loading state - Persian
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-surface" dir="rtl">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <p className="text-slate-400 text-sm font-vazirmatn-regular">{t('common.loading')}</p>
          <p className="text-slate-500 text-xs mt-2 font-vazirmatn-light">در حال بارگذاری رنک‌فورج...</p>
        </div>
      </div>
    );
  }

  // No backend configured - Persian
  if (status === 'no_backend') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface p-6" dir="rtl">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 font-vazirmatn-bold">رنک‌فورج</h1>
            <p className="text-slate-400 font-vazirmatn-regular">پلتفرم جامع اتوماسیون سئو</p>
          </div>

          <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-6 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-accent-yellow flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2 font-vazirmatn-bold">اتصال به بک‌اند برقرار نیست</h3>
                <p className="text-sm text-slate-400 mb-4 font-vazirmatn-regular">
                  رنک‌فورج نیاز به سرور API دارد. متغیر <code className="text-brand-400 bg-surface px-1.5 py-0.5 rounded text-xs ltr-content">VITE_API_URL</code> را تنظیم کنید.
                </p>
                <div className="bg-surface/50 rounded-lg p-3">
                  <p className="text-xs text-slate-400 font-mono ltr-content">VITE_API_URL=https://api.your-rankforge.com</p>
                </div>
                <p className="text-xs text-slate-500 mt-3 font-vazirmatn-light">
                  برای راهنمای نصب به <code className="text-brand-400">docs/DEPLOYMENT.md</code> مراجعه کنید.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Login screen - Persian
  if (status === 'unauthenticated') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface p-6" dir="rtl">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 font-vazirmatn-bold">رنک‌فورج</h1>
            <p className="text-slate-400 font-vazirmatn-regular">{t('auth.loginSubtitle')}</p>
          </div>

          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-6">
            <AuthForm onSuccess={() => { setState(s => ({ ...s, isAuthenticated: true })); setStatus('ready'); refreshData(); }} />
          </div>
        </div>
      </div>
    );
  }

  // Main application - RTL layout
  return (
    <AppContext.Provider value={{ state, actions }}>
      <div dir="rtl" lang="fa" className="font-vazirmatn-regular">
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:projectId" element={<ProjectLayout />}>
                <Route path="audit" element={<SiteAudit />} />
                <Route path="keywords" element={<Keywords />} />
                <Route path="rankings" element={<Rankings />} />
                <Route path="competitors" element={<Competitors />} />
                <Route path="backlinks" element={<Backlinks />} />
                <Route path="content" element={<Content />} />
                <Route path="geo" element={<GEO />} />
                <Route path="aeo" element={<AEO />} />
                <Route path="reports" element={<Reports />} />
                <Route path="automation" element={<Automation />} />
                <Route path="alerts" element={<Alerts />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              <Route path="/integrations" element={<Integrations />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/team" element={<Team />} />
              <Route path="/agency" element={<Agency />} />
              <Route path="/api" element={<ApiPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </div>
    </AppContext.Provider>
  );
}

// Auth form with login / signup tabs - Persian
function AuthForm({ onSuccess }: { onSuccess: () => void }) {
  const [recovering,setRecovering]=useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'signup') {
      if (!name.trim()) {
        setError(t('auth.nameRequired'));
        return;
      }
      if (password.length < 8) {
        setError(t('auth.passwordTooShort'));
        return;
      }
    }

    setLoading(true);
    const result = mode === 'login'
      ? await api.login(email, password)
      : await api.signup(email, password, name.trim());
    setLoading(false);

    if (result.success) {
      onSuccess();
    } else {
      setError(result.error.message);
    }
  };

  const switchMode = (next: 'login' | 'signup') => {
    setMode(next);
    setError(null);
  };

  if (recovering) return <PasswordRecovery onBack={()=>setRecovering(false)} />;

  return (
    <div dir="rtl">
      <button type="button" onClick={()=>setRecovering(true)} className="text-brand-400 text-sm mb-4">رمز عبور را فراموش کرده‌اید؟</button>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 bg-surface rounded-lg">
        <button
          type="button"
          onClick={() => switchMode('login')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium font-vazirmatn-medium transition-colors ${
            mode === 'login' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          {t('auth.login')}
        </button>
        <button
          type="button"
          onClick={() => switchMode('signup')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium font-vazirmatn-medium transition-colors ${
            mode === 'signup' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          {t('auth.signup')}
        </button>
      </div>

      <p className="text-xs text-slate-500 mb-4 font-vazirmatn-light">
        {mode === 'login' ? t('auth.loginSubtitle') : t('auth.signupSubtitle')}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-accent-red/10 border border-accent-red/20">
            <p className="text-xs text-accent-red font-vazirmatn-regular">{error}</p>
          </div>
        )}
        {mode === 'signup' && (
          <div>
            <label className="text-xs font-medium text-slate-300 mb-1.5 block font-vazirmatn-medium">
              {t('auth.fullName')}
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('auth.fullNamePlaceholder')}
              required
              className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50"
            />
          </div>
        )}
        <div>
          <label className="text-xs font-medium text-slate-300 mb-1.5 block font-vazirmatn-medium">
            {t('auth.email')}
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={t('auth.emailPlaceholder')}
            required
            dir="ltr"
            className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50 ltr-content"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-300 mb-1.5 block font-vazirmatn-medium">
            {t('auth.password')}
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={t('auth.passwordPlaceholder')}
            required
            minLength={mode === 'signup' ? 8 : 1}
            dir="ltr"
            className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50 ltr-content"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          aria-label={mode === 'login' ? t('auth.loginButton') : t('auth.signupButton')}
          className="w-full px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg font-vazirmatn-medium"
        >
          {loading ? t('common.loading') : mode === 'login' ? t('auth.loginButton') : t('auth.signupButton')}
        </button>
        <div className="text-center">
          <p className="text-xs text-slate-500 font-vazirmatn-light">
            {mode === 'login' ? (
              <>{t('auth.noAccount')}{' '}
                <button type="button" onClick={() => switchMode('signup')} className="text-brand-400 hover:text-brand-300">
                  {t('auth.createAccount')}
                </button>
              </>
            ) : (
              <>{t('auth.alreadyHaveAccount')}{' '}
                <button type="button" onClick={() => switchMode('login')} className="text-brand-400 hover:text-brand-300">
                  {t('auth.login')}
                </button>
              </>
            )}
          </p>
        </div>
      </form>
    </div>
  );
}

// Project layout wrapper - loads project by ID from URL
function ProjectLayout() {
  const { projectId } = useParams();
  const { state, actions } = useAppState();
  const [resolved, setResolved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setCurrentProject = actions.setCurrentProject;
  useEffect(() => {
    let cancelled = false;
    setResolved(null);
    setError(null);
    if (!projectId) return;
    api.getProject(projectId).then(result => {
      if (cancelled) return;
      if (result.success) { setCurrentProject(result.data); setResolved(projectId); }
      else setError(result.error.status === 404 ? 'پروژه پیدا نشد یا به آن دسترسی ندارید.' : 'بارگذاری پروژه ناموفق بود. دوباره تلاش کنید.');
    });
    return () => { cancelled = true; };
  }, [projectId, setCurrentProject]);
  if (error) return <div role="alert">{error}</div>;
  if (resolved !== projectId || state.currentProject?.id !== projectId) return <p role="status">در حال بارگذاری پروژه…</p>;
  return <Outlet key={projectId} />;
}

export default App;
