import { useState, useEffect, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
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
import { AppContext } from './lib/store';
import type { AppState, AppActions } from './lib/store';
import type { Organization, Project, ProviderStatus } from './lib/types';
import { api } from './lib/api';
import { isApiError, ApiErrorCode } from './lib/api';

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

  const actions: AppActions = {
    setAuthenticated: (v) => setState(s => ({ ...s, isAuthenticated: v })),
    setCurrentOrg: (org) => setState(s => ({ ...s, currentOrg: org })),
    setCurrentProject: (project) => setState(s => ({ ...s, currentProject: project })),
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

  // Initialize app
  useEffect(() => {
    async function initialize() {
      // Check if backend is available
      const available = await api.checkAvailability();
      
      if (!available) {
        setStatus('no_backend');
        return;
      }

      // Check authentication
      const userResult = await api.getCurrentUser();
      if (!userResult.success) {
        if (isApiError(userResult.error) && 
            (userResult.error.code === ApiErrorCode.UNAUTHENTICATED || 
             userResult.error.code === ApiErrorCode.SESSION_EXPIRED)) {
          setStatus('unauthenticated');
          return;
        }
        // Other error - still show unauthenticated
        setStatus('unauthenticated');
        return;
      }

      // Load organization and project data
      await refreshData();
      setState(s => ({ ...s, isAuthenticated: true }));
      setStatus('ready');
    }

    initialize();
  }, [refreshData]);

  // Loading state
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-surface">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <p className="text-slate-400 text-sm">Loading RankForge...</p>
        </div>
      </div>
    );
  }

  // No backend configured
  if (status === 'no_backend') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface p-6">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">RankForge</h1>
            <p className="text-slate-400">Commercial SEO Automation SaaS Platform</p>
          </div>

          <div className="bg-surface-2 border border-accent-yellow/30 rounded-xl p-6 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-accent-yellow flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Backend Not Connected</h3>
                <p className="text-sm text-slate-400 mb-4">
                  RankForge requires a backend API server. Set <code className="text-brand-400 bg-surface px-1.5 py-0.5 rounded text-xs">VITE_API_URL</code> to your API endpoint.
                </p>
                <div className="bg-surface/50 rounded-lg p-3">
                  <p className="text-xs text-slate-400 font-mono">VITE_API_URL=https://api.your-rankforge.com</p>
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  See <code className="text-brand-400">docs/DEPLOYMENT.md</code> for setup instructions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Login screen
  if (status === 'unauthenticated') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface p-6">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">RankForge</h1>
            <p className="text-slate-400">Sign in to your account</p>
          </div>

          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-6">
            <LoginForm onSuccess={() => { setStatus('ready'); refreshData(); }} />
          </div>
        </div>
      </div>
    );
  }

  // Main application
  return (
    <AppContext.Provider value={{ state, actions }}>
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
    </AppContext.Provider>
  );
}

// Login form component
function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await api.login(email, password);
    setLoading(false);

    if (result.success) {
      onSuccess();
    } else {
      setError(result.error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-accent-red/10 border border-accent-red/20">
          <p className="text-xs text-accent-red">{error}</p>
        </div>
      )}
      <div>
        <label className="text-xs font-medium text-slate-300 mb-1.5 block">Email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@company.com"
          required
          className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-300 mb-1.5 block">Password</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
      >
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );
}

// Project layout wrapper - loads project by ID from URL
function ProjectLayout() {
  return <Outlet />;
}

export default App;
