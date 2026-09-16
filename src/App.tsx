import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
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
import { api, checkApiAvailability } from './lib/api';

function App() {
  const [loading, setLoading] = useState(true);
  const [apiAvailable, setApiAvailable] = useState(false);
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

  // Initialize app - check API availability and load real data
  useEffect(() => {
    async function initialize() {
      try {
        // Check if backend API is available
        const available = await checkApiAvailability();
        setApiAvailable(available);

        if (available) {
          // Load real data from API
          const [org, projects, providerStatus] = await Promise.all([
            api.getCurrentOrganization(),
            api.getProjects(),
            api.getProviderStatus(),
          ]);

          setState(s => ({
            ...s,
            isAuthenticated: org !== null,
            currentOrg: org,
            projects: projects,
            currentProject: projects.length > 0 ? projects[0] : null,
            providerStatus: providerStatus,
          }));
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
      } finally {
        setLoading(false);
      }
    }

    initialize();
  }, []);

  // Show loading state
  if (loading) {
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

  // Show setup screen if API not available
  if (!apiAvailable) {
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
                <h3 className="text-lg font-semibold text-white mb-2">Backend Not Configured</h3>
                <p className="text-sm text-slate-400 mb-4">
                  RankForge requires a backend API to function. The frontend application is ready, but needs to be connected to:
                </p>
                <ul className="text-sm text-slate-400 space-y-1 mb-4">
                  <li>• PostgreSQL database</li>
                  <li>• API server (Node.js/Next.js)</li>
                  <li>• Background worker process</li>
                  <li>• Provider credentials (DataForSEO, OpenAI, Stripe, etc.)</li>
                </ul>
                <p className="text-sm text-slate-400">
                  See <code className="text-brand-400 bg-surface px-1.5 py-0.5 rounded">docs/ARCHITECTURE.md</code> for setup instructions.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-white mb-3">Quick Start</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-brand-600/20 text-brand-400 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                <div>
                  <p className="text-white font-medium">Set up environment variables</p>
                  <p className="text-slate-400 text-xs mt-0.5">Copy .env.example to .env and configure all required variables</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-brand-600/20 text-brand-400 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                <div>
                  <p className="text-white font-medium">Start PostgreSQL database</p>
                  <p className="text-slate-400 text-xs mt-0.5">Use Docker or install PostgreSQL locally</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-brand-600/20 text-brand-400 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                <div>
                  <p className="text-white font-medium">Run database migrations</p>
                  <p className="text-slate-400 text-xs mt-0.5">Execute migration scripts to create schema</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-brand-600/20 text-brand-400 flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
                <div>
                  <p className="text-white font-medium">Start API server</p>
                  <p className="text-slate-400 text-xs mt-0.5">Run the backend API server</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-brand-600/20 text-brand-400 flex items-center justify-center text-xs font-bold flex-shrink-0">5</span>
                <div>
                  <p className="text-white font-medium">Configure VITE_API_URL</p>
                  <p className="text-slate-400 text-xs mt-0.5">Set the API URL in environment variables</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 text-center">
            <p className="text-xs text-slate-500">
              RankForge v1.0.0 • Commercial SEO Automation SaaS
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!state.isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface p-6">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Welcome to RankForge</h1>
            <p className="text-slate-400">Sign in to your account</p>
          </div>

          <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-6">
            <form className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Email</label>
                <input
                  type="email"
                  placeholder="you@company.com"
                  className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 bg-surface border border-surface-3/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-600/50"
                />
              </div>
              <button
                type="submit"
                className="w-full px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg"
              >
                Sign In
              </button>
            </form>

            <div className="mt-4 text-center">
              <p className="text-xs text-slate-400">
                Don't have an account? <a href="#" className="text-brand-400 hover:text-brand-300">Sign up</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main application
  return (
    <AppContext.Provider value={{ state, actions }}>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/audit" element={<SiteAudit />} />
            <Route path="/keywords" element={<Keywords />} />
            <Route path="/rankings" element={<Rankings />} />
            <Route path="/competitors" element={<Competitors />} />
            <Route path="/backlinks" element={<Backlinks />} />
            <Route path="/content" element={<Content />} />
            <Route path="/geo" element={<GEO />} />
            <Route path="/aeo" element={<AEO />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/automation" element={<Automation />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/team" element={<Team />} />
            <Route path="/agency" element={<Agency />} />
            <Route path="/api" element={<ApiPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Layout>
      </HashRouter>
    </AppContext.Provider>
  );
}

export default App;
