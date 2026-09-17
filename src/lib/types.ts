// RankForge - SEO Automation SaaS Platform
// Core Type Definitions

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'notice';
export type AuditCategory = 'crawlability' | 'indexability' | 'metadata' | 'content' | 'links' | 'images' | 'performance' | 'security' | 'structured-data' | 'international';
export type JobType = 'SITE_CRAWL' | 'RANK_CHECK' | 'KEYWORD_REFRESH' | 'BACKLINK_REFRESH' | 'GSC_SYNC' | 'GA4_SYNC' | 'PAGESPEED_CHECK' | 'COMPETITOR_CHECK' | 'AI_VISIBILITY_CHECK' | 'REPORT_GENERATION' | 'ALERT_PROCESSING';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type PlanTier = 'FREE' | 'STARTER' | 'PRO' | 'AGENCY' | 'ENTERPRISE';
export type Role = 'owner' | 'admin' | 'manager' | 'seo_manager' | 'analyst' | 'editor' | 'client' | 'viewer';
export type ProviderStatus = 'connected' | 'not_configured' | 'error' | 'rate_limited';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: PlanTier;
  createdAt: string;
  members: OrganizationMember[];
  credits: CreditWallet;
}

export interface OrganizationMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: Role;
  joinedAt: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  domain: string;
  country: string;
  language: string;
  timezone: string;
  searchEngines: string[];
  device: 'desktop' | 'mobile' | 'both';
  competitors: string[];
  crawlConfig: CrawlConfig;
  integrations: ProjectIntegrations;
  createdAt: string;
  lastCrawlAt: string | null;
  seoScore: number | null;
}

export interface CrawlConfig {
  maxDepth: number;
  maxPages: number;
  concurrency: number;
  crawlDelay: number;
  userAgent: string;
  respectRobots: boolean;
  renderJavaScript: boolean;
}

export interface ProjectIntegrations {
  gsc: ProviderStatus;
  ga4: ProviderStatus;
  pagespeed: ProviderStatus;
  dataForSeo: ProviderStatus;
}

export interface CreditWallet {
  balance: number;
  totalGranted: number;
  totalConsumed: number;
  lastUpdated: string;
}

export interface AuditFinding {
  id: string;
  ruleId: string;
  severity: Severity;
  category: AuditCategory;
  title: string;
  description: string;
  affectedUrls: string[];
  recommendation: string;
  status: 'open' | 'fixed' | 'ignored';
}

export interface Keyword {
  id: string;
  projectId: string;
  term: string;
  volume: number | null;
  cpc: number | null;
  difficulty: number | null;
  intent: 'informational' | 'navigational' | 'commercial' | 'transactional' | null;
  currentPosition: number | null;
  previousPosition: number | null;
  provider: string | null;
  lastChecked: string | null;
}

export interface RankingEntry {
  keyword: string;
  position: number | null;
  url: string | null;
  date: string;
  change: number | null;
  engine: string;
  country: string;
  device: string;
}

export interface CrawlPage {
  url: string;
  status: number;
  title: string;
  metaDescription: string;
  wordCount: number;
  responseTime: number;
  issues: AuditFinding[];
  links: { internal: number; external: number };
  images: { total: number; missingAlt: number };
}

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  projectId: string;
  organizationId: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  attempts: number;
}

export interface Report {
  id: string;
  projectId: string;
  type: string;
  title: string;
  format: 'pdf' | 'html' | 'csv' | 'json';
  status: 'generating' | 'ready' | 'failed';
  createdAt: string;
  downloadUrl: string | null;
}

export interface Alert {
  id: string;
  projectId: string;
  rule: string;
  type?: string;
  title?: string;
  message: string;
  severity: Severity;
  triggeredAt: string;
  read: boolean;
  data?: any;
  createdAt?: string;
}

export interface AIUsage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  timestamp: string;
  projectId: string;
}

export interface PlanLimits {
  projects: number;
  keywords: number;
  crawledPages: number;
  rankChecks: number;
  aiOperations: number;
  reports: number;
  users: number;
  apiRequests: number;
  competitors: number;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  FREE: { projects: 1, keywords: 50, crawledPages: 100, rankChecks: 30, aiOperations: 5, reports: 2, users: 1, apiRequests: 100, competitors: 1 },
  STARTER: { projects: 3, keywords: 500, crawledPages: 1000, rankChecks: 300, aiOperations: 50, reports: 10, users: 3, apiRequests: 1000, competitors: 5 },
  PRO: { projects: 10, keywords: 5000, crawledPages: 10000, rankChecks: 3000, aiOperations: 500, reports: 50, users: 10, apiRequests: 10000, competitors: 20 },
  AGENCY: { projects: 50, keywords: 25000, crawledPages: 50000, rankChecks: 15000, aiOperations: 2500, reports: 200, users: 50, apiRequests: 50000, competitors: 100 },
  ENTERPRISE: { projects: -1, keywords: -1, crawledPages: -1, rankChecks: -1, aiOperations: -1, reports: -1, users: -1, apiRequests: -1, competitors: -1 },
};
