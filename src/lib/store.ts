import { createContext, useContext } from 'react';
import type { Organization, Project, Job, Alert, PlanTier, ProviderStatus } from './types';

export interface AppState {
  isAuthenticated: boolean;
  currentOrg: Organization | null;
  currentProject: Project | null;
  projects: Project[];
  jobs: Job[];
  alerts: Alert[];
  providerStatus: Record<string, ProviderStatus>;
  theme: 'dark' | 'light';
}

export interface AppActions {
  setAuthenticated: (v: boolean) => void;
  setCurrentOrg: (org: Organization | null) => void;
  setCurrentProject: (project: Project | null) => void;
  addProject: (project: Project) => void;
  dismissAlert: (id: string) => void;
}

const defaultState: AppState = {
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
};

export const AppContext = createContext<{ state: AppState; actions: AppActions }>({
  state: defaultState,
  actions: {
    setAuthenticated: () => {},
    setCurrentOrg: () => {},
    setCurrentProject: () => {},
    addProject: () => {},
    dismissAlert: () => {},
  },
});

export function useAppState() {
  return useContext(AppContext);
}

export function getProviderLabel(key: string): string {
  const labels: Record<string, string> = {
    dataForSeo: 'DataForSEO',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    googleSearchConsole: 'Google Search Console',
    googleAnalytics: 'Google Analytics 4',
    stripe: 'Stripe',
    s3: 'S3 Storage',
  };
  return labels[key] || key;
}

export function getStatusColor(status: ProviderStatus): string {
  switch (status) {
    case 'connected': return 'text-accent-green';
    case 'not_configured': return 'text-accent-yellow';
    case 'error': return 'text-accent-red';
    case 'rate_limited': return 'text-accent-purple';
  }
}

export function getStatusLabel(status: ProviderStatus): string {
  switch (status) {
    case 'connected': return 'Connected';
    case 'not_configured': return 'Not Configured';
    case 'error': return 'Error';
    case 'rate_limited': return 'Rate Limited';
  }
}

export function formatNumber(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

export function getPlanName(plan: PlanTier): string {
  const names: Record<PlanTier, string> = {
    FREE: 'Free',
    STARTER: 'Starter',
    PRO: 'Professional',
    AGENCY: 'Agency',
    ENTERPRISE: 'Enterprise',
  };
  return names[plan];
}
