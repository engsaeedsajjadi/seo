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
import type { Organization, Project } from './lib/types';

// Demo state - in production this comes from real backend
const demoOrg: Organization = {
  id: 'org_demo',
  name: 'Demo Organization',
  slug: 'demo-org',
  plan: 'PRO',
  createdAt: '2024-01-01T00:00:00Z',
  members: [],
  credits: { balance: 4500, totalGranted: 10000, totalConsumed: 5500, lastUpdated: new Date().toISOString() },
};

const demoProject: Project = {
  id: 'proj_demo',
  organizationId: 'org_demo',
  name: 'Demo Website',
  domain: 'example.com',
  country: 'US',
  language: 'en',
  timezone: 'America/New_York',
  searchEngines: ['google'],
  device: 'both',
  competitors: ['competitor-a.com', 'competitor-b.com'],
  crawlConfig: { maxDepth: 5, maxPages: 500, concurrency: 5, crawlDelay: 1000, userAgent: 'RankForge/1.0', respectRobots: true, renderJavaScript: false },
  integrations: { gsc: 'not_configured', ga4: 'not_configured', pagespeed: 'not_configured', dataForSeo: 'not_configured' },
  createdAt: '2024-01-15T00:00:00Z',
  lastCrawlAt: '2024-06-20T02:00:00Z',
  seoScore: 67,
};

function App() {
  const [state, setState] = useState<AppState>({
    isAuthenticated: true, // Demo mode
    currentOrg: demoOrg,
    currentProject: demoProject,
    projects: [demoProject],
    jobs: [],
    alerts: [
      { id: '1', projectId: 'proj_demo', rule: 'rank_drop', message: 'Keyword position dropped', severity: 'high', triggeredAt: new Date().toISOString(), read: false },
      { id: '2', projectId: 'proj_demo', rule: 'critical_issue', message: 'HTTPS redirect missing', severity: 'critical', triggeredAt: new Date().toISOString(), read: false },
    ],
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
