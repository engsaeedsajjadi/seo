/**
 * RankForge — Production Database Schema
 * PostgreSQL + Drizzle ORM
 * Multi-tenant with RLS support
 * 
 * This schema covers all required entities from the master prompt:
 * users, organizations, projects, SEO engine, billing, etc.
 */

import { pgTable, uuid, varchar, text, integer, boolean, timestamp, jsonb, decimal, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================
// AUTH & MULTI-TENANCY
// ============================================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: text('password_hash'),
  emailVerified: boolean('email_verified').default(false),
  emailVerifiedAt: timestamp('email_verified_at'),
  avatarUrl: text('avatar_url'),
  twoFactorEnabled: boolean('two_factor_enabled').default(false),
  twoFactorSecret: text('two_factor_secret'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  emailIdx: uniqueIndex('users_email_idx').on(table.email),
}));

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  ownerId: uuid('owner_id').notNull().references(() => users.id),
  plan: varchar('plan', { length: 20 }).default('FREE').notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  subscriptionStatus: varchar('subscription_status', { length: 20 }).default('active'),
  trialEndsAt: timestamp('trial_ends_at'),
  settings: jsonb('settings').default({}),
  whiteLabel: jsonb('white_label').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  slugIdx: uniqueIndex('orgs_slug_idx').on(table.slug),
  ownerIdx: index('orgs_owner_idx').on(table.ownerId),
}));

export const organizationMembers = pgTable('organization_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull().default('Viewer'),
  permissions: jsonb('permissions').default([]),
  invitedAt: timestamp('invited_at').defaultNow(),
  joinedAt: timestamp('joined_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgUserIdx: uniqueIndex('org_members_org_user_idx').on(table.organizationId, table.userId),
  orgIdx: index('org_members_org_idx').on(table.organizationId),
  userIdx: index('org_members_user_idx').on(table.userId),
}));

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  revokedAt: timestamp('revoked_at'),
}, (table) => ({
  tokenIdx: uniqueIndex('sessions_token_idx').on(table.token),
  userIdx: index('sessions_user_idx').on(table.userId),
}));

// ============================================================
// PROJECTS
// ============================================================

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  domain: varchar('domain', { length: 255 }).notNull(),
  normalizedDomain: varchar('normalized_domain', { length: 255 }).notNull(),
  country: varchar('country', { length: 2 }).default('US').notNull(),
  language: varchar('language', { length: 2 }).default('en').notNull(),
  timezone: varchar('timezone', { length: 50 }).default('UTC').notNull(),
  searchEngines: jsonb('search_engines').default(['google']),
  device: varchar('device', { length: 10 }).default('both').notNull(),
  competitors: jsonb('competitors').default([]),
  targetKeywords: jsonb('target_keywords').default([]),
  crawlConfig: jsonb('crawl_config').default({}),
  notificationRules: jsonb('notification_rules').default({}),
  integrations: jsonb('integrations').default({}),
  seoScore: integer('seo_score'),
  lastCrawlAt: timestamp('last_crawl_at'),
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  orgIdx: index('projects_org_idx').on(table.organizationId),
  domainIdx: index('projects_domain_idx').on(table.normalizedDomain),
  orgDomainIdx: uniqueIndex('projects_org_domain_idx').on(table.organizationId, table.normalizedDomain),
}));

// ============================================================
// CRAWLER & AUDIT
// ============================================================

export const crawlRuns = pgTable('crawl_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  totalPages: integer('total_pages').default(0),
  crawledPages: integer('crawled_pages').default(0),
  failedPages: integer('failed_pages').default(0),
  config: jsonb('config').default({}),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('crawl_runs_org_idx').on(table.organizationId),
  projectIdx: index('crawl_runs_project_idx').on(table.projectId),
  statusIdx: index('crawl_runs_status_idx').on(table.status),
}));

export const crawlPages = pgTable('crawl_pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  crawlRunId: uuid('crawl_run_id').notNull().references(() => crawlRuns.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  normalizedUrl: text('normalized_url').notNull(),
  statusCode: integer('status_code'),
  contentType: varchar('content_type', { length: 100 }),
  title: text('title'),
  metaDescription: text('meta_description'),
  h1: text('h1'),
  h2: text('h2').array(),
  wordCount: integer('word_count'),
  responseTime: integer('response_time'),
  isIndexable: boolean('is_indexable').default(true),
  canonical: text('canonical'),
  robotsMeta: text('robots_meta'),
  hreflang: jsonb('hreflang').default([]),
  structuredData: jsonb('structured_data').default([]),
  images: jsonb('images').default([]),
  links: jsonb('links').default([]),
  headers: jsonb('headers').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  crawlRunIdx: index('crawl_pages_crawl_run_idx').on(table.crawlRunId),
  projectIdx: index('crawl_pages_project_idx').on(table.projectId),
  urlIdx: index('crawl_pages_url_idx').on(table.normalizedUrl),
}));

export const auditRules = pgTable('audit_rules', {
  id: varchar('id', { length: 100 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description').notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  severity: varchar('severity', { length: 20 }).notNull(),
  documentationUrl: text('documentation_url'),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditFindings = pgTable('audit_findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  crawlRunId: uuid('crawl_run_id').references(() => crawlRuns.id, { onDelete: 'set null' }),
  ruleId: varchar('rule_id', { length: 100 }).notNull().references(() => auditRules.id),
  severity: varchar('severity', { length: 20 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  evidence: jsonb('evidence').default({}),
  affectedUrls: text('affected_urls').array().default([]),
  recommendation: text('recommendation').notNull(),
  status: varchar('status', { length: 20 }).default('open').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('audit_findings_org_idx').on(table.organizationId),
  projectIdx: index('audit_findings_project_idx').on(table.projectId),
  ruleIdx: index('audit_findings_rule_idx').on(table.ruleId),
  severityIdx: index('audit_findings_severity_idx').on(table.severity),
}));

// ============================================================
// KEYWORDS & SERP & RANKINGS
// ============================================================

export const keywordGroups = pgTable('keyword_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('keyword_groups_org_idx').on(table.organizationId),
  projectIdx: index('keyword_groups_project_idx').on(table.projectId),
}));

export const keywords = pgTable('keywords', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').references(() => keywordGroups.id, { onDelete: 'set null' }),
  keyword: varchar('keyword', { length: 500 }).notNull(),
  normalizedKeyword: varchar('normalized_keyword', { length: 500 }).notNull(),
  country: varchar('country', { length: 2 }).default('US').notNull(),
  language: varchar('language', { length: 2 }).default('en').notNull(),
  searchVolume: integer('search_volume'),
  cpc: decimal('cpc', { precision: 10, scale: 2 }),
  competition: decimal('competition', { precision: 5, scale: 2 }),
  difficulty: integer('difficulty'),
  intent: varchar('intent', { length: 20 }),
  serpFeatures: jsonb('serp_features').default([]),
  trend: jsonb('trend').default([]),
  provider: varchar('provider', { length: 50 }),
  providerData: jsonb('provider_data').default({}),
  lastCheckedAt: timestamp('last_checked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('keywords_org_idx').on(table.organizationId),
  projectIdx: index('keywords_project_idx').on(table.projectId),
  keywordIdx: index('keywords_keyword_idx').on(table.normalizedKeyword),
  orgKeywordIdx: uniqueIndex('keywords_org_keyword_idx').on(table.organizationId, table.projectId, table.normalizedKeyword, table.country, table.language),
}));

export const serpResults = pgTable('serp_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  keywordId: uuid('keyword_id').references(() => keywords.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  query: varchar('query', { length: 500 }).notNull(),
  engine: varchar('engine', { length: 20 }).default('google').notNull(),
  country: varchar('country', { length: 2 }).default('US').notNull(),
  language: varchar('language', { length: 2 }).default('en').notNull(),
  device: varchar('device', { length: 10 }).default('desktop').notNull(),
  results: jsonb('results').notNull(),
  serpFeatures: jsonb('serp_features').default([]),
  provider: varchar('provider', { length: 50 }).notNull(),
  providerRequestId: text('provider_request_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('serp_results_org_idx').on(table.organizationId),
  keywordIdx: index('serp_results_keyword_idx').on(table.keywordId),
  queryIdx: index('serp_results_query_idx').on(table.query),
  createdIdx: index('serp_results_created_idx').on(table.createdAt),
}));

export const keywordRankings = pgTable('keyword_rankings', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  keywordId: uuid('keyword_id').notNull().references(() => keywords.id, { onDelete: 'cascade' }),
  position: integer('position'),
  previousPosition: integer('previous_position'),
  url: text('url'),
  searchEngine: varchar('search_engine', { length: 20 }).default('google').notNull(),
  country: varchar('country', { length: 2 }).default('US').notNull(),
  language: varchar('language', { length: 2 }).default('en').notNull(),
  device: varchar('device', { length: 10 }).default('desktop').notNull(),
  serpFeatures: jsonb('serp_features').default([]),
  date: timestamp('date').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('rankings_org_idx').on(table.organizationId),
  projectIdx: index('rankings_project_idx').on(table.projectId),
  keywordIdx: index('rankings_keyword_idx').on(table.keywordId),
  dateIdx: index('rankings_date_idx').on(table.date),
  keywordDateIdx: index('rankings_keyword_date_idx').on(table.keywordId, table.date),
}));

// ============================================================
// COMPETITORS & BACKLINKS
// ============================================================

export const competitors = pgTable('competitors', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  domain: varchar('domain', { length: 255 }).notNull(),
  normalizedDomain: varchar('normalized_domain', { length: 255 }).notNull(),
  isAutoDiscovered: boolean('is_auto_discovered').default(false).notNull(),
  visibility: decimal('visibility', { precision: 10, scale: 2 }),
  keywordsOverlap: integer('keywords_overlap'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('competitors_org_idx').on(table.organizationId),
  projectIdx: index('competitors_project_idx').on(table.projectId),
  domainIdx: index('competitors_domain_idx').on(table.normalizedDomain),
}));

export const backlinks = pgTable('backlinks', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  sourceDomain: varchar('source_domain', { length: 255 }).notNull(),
  sourceUrl: text('source_url').notNull(),
  targetUrl: text('target_url').notNull(),
  anchorText: text('anchor_text'),
  firstSeen: timestamp('first_seen').defaultNow().notNull(),
  lastSeen: timestamp('last_seen').defaultNow().notNull(),
  lostAt: timestamp('lost_at'),
  isNew: boolean('is_new').default(false),
  isLost: boolean('is_lost').default(false),
  domainRating: integer('domain_rating'),
  pageRating: integer('page_rating'),
  provider: varchar('provider', { length: 50 }).notNull(),
  providerData: jsonb('provider_data').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('backlinks_org_idx').on(table.organizationId),
  projectIdx: index('backlinks_project_idx').on(table.projectId),
  sourceDomainIdx: index('backlinks_source_domain_idx').on(table.sourceDomain),
}));

// ============================================================
// GOOGLE INTEGRATIONS
// ============================================================

export const gscConnections = pgTable('gsc_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  siteUrl: text('site_url').notNull(),
  connectedAt: timestamp('connected_at').defaultNow().notNull(),
  lastSyncAt: timestamp('last_sync_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('gsc_connections_org_idx').on(table.organizationId),
  projectIdx: index('gsc_connections_project_idx').on(table.projectId),
}));

export const gscMetrics = pgTable('gsc_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  date: timestamp('date').notNull(),
  clicks: integer('clicks').default(0),
  impressions: integer('impressions').default(0),
  ctr: decimal('ctr', { precision: 5, scale: 4 }).default('0'),
  position: decimal('position', { precision: 5, scale: 2 }).default('0'),
  query: text('query'),
  page: text('page'),
  country: varchar('country', { length: 2 }),
  device: varchar('device', { length: 10 }),
  searchAppearance: varchar('search_appearance', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('gsc_metrics_org_idx').on(table.organizationId),
  projectIdx: index('gsc_metrics_project_idx').on(table.projectId),
  dateIdx: index('gsc_metrics_date_idx').on(table.date),
}));

export const ga4Connections = pgTable('ga4_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  propertyId: text('property_id').notNull(),
  connectedAt: timestamp('connected_at').defaultNow().notNull(),
  lastSyncAt: timestamp('last_sync_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('ga4_connections_org_idx').on(table.organizationId),
  projectIdx: index('ga4_connections_project_idx').on(table.projectId),
}));

export const ga4Metrics = pgTable('ga4_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  date: timestamp('date').notNull(),
  users: integer('users').default(0),
  sessions: integer('sessions').default(0),
  organicUsers: integer('organic_users').default(0),
  organicSessions: integer('organic_sessions').default(0),
  landingPage: text('landing_page'),
  conversions: integer('conversions').default(0),
  revenue: decimal('revenue', { precision: 10, scale: 2 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('ga4_metrics_org_idx').on(table.organizationId),
  projectIdx: index('ga4_metrics_project_idx').on(table.projectId),
  dateIdx: index('ga4_metrics_date_idx').on(table.date),
}));

export const pagespeedResults = pgTable('pagespeed_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  device: varchar('device', { length: 10 }).default('mobile').notNull(),
  performanceScore: integer('performance_score'),
  accessibilityScore: integer('accessibility_score'),
  bestPracticesScore: integer('best_practices_score'),
  seoScore: integer('seo_score'),
  lcp: decimal('lcp', { precision: 10, scale: 2 }),
  inp: decimal('inp', { precision: 10, scale: 2 }),
  cls: decimal('cls', { precision: 10, scale: 4 }),
  fcp: decimal('fcp', { precision: 10, scale: 2 }),
  ttfb: decimal('ttfb', { precision: 10, scale: 2 }),
  rawResult: jsonb('raw_result'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('pagespeed_org_idx').on(table.organizationId),
  projectIdx: index('pagespeed_project_idx').on(table.projectId),
  urlIdx: index('pagespeed_url_idx').on(table.url),
}));

// ============================================================
// CONTENT & AI & GEO/AEO
// ============================================================

export const contentItems = pgTable('content_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  targetKeyword: varchar('target_keyword', { length: 500 }),
  contentType: varchar('content_type', { length: 20 }).default('article'),
  targetWordCount: integer('target_word_count'),
  status: varchar('status', { length: 20 }).default('draft').notNull(),
  outline: jsonb('outline'),
  brief: jsonb('brief'),
  content: text('content'),
  seoScore: integer('seo_score'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('content_org_idx').on(table.organizationId),
  projectIdx: index('content_project_idx').on(table.projectId),
}));

export const aiRuns = pgTable('ai_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  provider: varchar('provider', { length: 50 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  operation: varchar('operation', { length: 50 }).notNull(),
  prompt: text('prompt').notNull(),
  response: text('response'),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  estimatedCostUsd: decimal('estimated_cost_usd', { precision: 10, scale: 6 }),
  latencyMs: integer('latency_ms'),
  status: varchar('status', { length: 20 }).default('completed').notNull(),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('ai_runs_org_idx').on(table.organizationId),
  projectIdx: index('ai_runs_project_idx').on(table.projectId),
  providerIdx: index('ai_runs_provider_idx').on(table.provider),
}));

export const geoRuns = pgTable('geo_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  aiEngine: varchar('ai_engine', { length: 50 }).notNull(),
  prompt: text('prompt').notNull(),
  answer: text('answer'),
  brandMentioned: boolean('brand_mentioned').default(false),
  brandPosition: integer('brand_position'),
  citedUrls: text('cited_urls').array().default([]),
  competitorMentions: jsonb('competitor_mentions').default([]),
  visibilityScore: decimal('visibility_score', { precision: 5, scale: 2 }),
  sentiment: varchar('sentiment', { length: 20 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('geo_runs_org_idx').on(table.organizationId),
  projectIdx: index('geo_runs_project_idx').on(table.projectId),
}));

// ============================================================
// AUTOMATION & JOBS
// ============================================================

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  payload: jsonb('payload').default({}),
  result: jsonb('result'),
  error: text('error'),
  attempts: integer('attempts').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(3).notNull(),
  scheduledAt: timestamp('scheduled_at'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('jobs_org_idx').on(table.organizationId),
  projectIdx: index('jobs_project_idx').on(table.projectId),
  statusIdx: index('jobs_status_idx').on(table.status),
  typeIdx: index('jobs_type_idx').on(table.type),
}));

export const jobAttempts = pgTable('job_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  attemptNumber: integer('attempt_number').notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  error: text('error'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
}, (table) => ({
  jobIdx: index('job_attempts_job_idx').on(table.jobId),
}));

// ============================================================
// ALERTS & NOTIFICATIONS
// ============================================================

export const notificationRules = pgTable('notification_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  condition: jsonb('condition').notNull(),
  channels: jsonb('channels').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('notification_rules_org_idx').on(table.organizationId),
}));

export const alerts = pgTable('alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  ruleId: uuid('rule_id').references(() => notificationRules.id, { onDelete: 'set null' }),
  type: varchar('type', { length: 50 }).notNull(),
  severity: varchar('severity', { length: 10 }).notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  data: jsonb('data').default({}),
  read: boolean('read').default(false).notNull(),
  triggeredAt: timestamp('triggered_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('alerts_org_idx').on(table.organizationId),
  projectIdx: index('alerts_project_idx').on(table.projectId),
  readIdx: index('alerts_read_idx').on(table.read),
}));

// ============================================================
// REPORTS
// ============================================================

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  title: text('title').notNull(),
  format: varchar('format', { length: 10 }).notNull(),
  status: varchar('status', { length: 20 }).default('generating').notNull(),
  storageKey: text('storage_key'),
  downloadUrl: text('download_url'),
  shareToken: text('share_token'),
  shareExpiresAt: timestamp('share_expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
}, (table) => ({
  orgIdx: index('reports_org_idx').on(table.organizationId),
  projectIdx: index('reports_project_idx').on(table.projectId),
}));

export const reportSchedules = pgTable('report_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  reportType: varchar('report_type', { length: 50 }).notNull(),
  format: varchar('format', { length: 10 }).default('pdf').notNull(),
  cron: varchar('cron', { length: 100 }).notNull(),
  timezone: varchar('timezone', { length: 50 }).default('UTC').notNull(),
  recipients: jsonb('recipients').default([]),
  enabled: boolean('enabled').default(true).notNull(),
  lastRunAt: timestamp('last_run_at'),
  nextRunAt: timestamp('next_run_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('report_schedules_org_idx').on(table.organizationId),
}));

// ============================================================
// BILLING & CREDITS
// ============================================================

export const plans = pgTable('plans', {
  id: varchar('id', { length: 20 }).primaryKey(),
  name: varchar('name', { length: 50 }).notNull(),
  description: text('description'),
  priceMonthlyCents: integer('price_monthly_cents').notNull(),
  priceAnnualCents: integer('price_annual_cents').notNull(),
  limits: jsonb('limits').notNull(),
  features: jsonb('features').default([]),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  planId: varchar('plan_id', { length: 20 }).notNull().references(() => plans.id),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripePriceId: text('stripe_price_id'),
  status: varchar('status', { length: 20 }).notNull(),
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  trialStart: timestamp('trial_start'),
  trialEnd: timestamp('trial_end'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: uniqueIndex('subscriptions_org_idx').on(table.organizationId),
}));

export const creditWallets = pgTable('credit_wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  balance: integer('balance').default(0).notNull(),
  totalGranted: integer('total_granted').default(0).notNull(),
  totalConsumed: integer('total_consumed').default(0).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: uniqueIndex('credit_wallets_org_idx').on(table.organizationId),
}));

export const creditTransactions = pgTable('credit_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 20 }).notNull(),
  amount: integer('amount').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  description: text('description'),
  referenceType: varchar('reference_type', { length: 50 }),
  referenceId: uuid('reference_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('credit_txns_org_idx').on(table.organizationId),
}));

export const usageRecords = pgTable('usage_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  metric: varchar('metric', { length: 50 }).notNull(),
  quantity: integer('quantity').notNull(),
  provider: varchar('provider', { length: 50 }),
  costCents: integer('cost_cents'),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('usage_org_idx').on(table.organizationId),
  periodIdx: index('usage_period_idx').on(table.periodStart, table.periodEnd),
  metricIdx: index('usage_metric_idx').on(table.metric),
}));

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  stripeInvoiceId: text('stripe_invoice_id'),
  amountCents: integer('amount_cents').notNull(),
  currency: varchar('currency', { length: 3 }).default('usd').notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  periodStart: timestamp('period_start'),
  periodEnd: timestamp('period_end'),
  pdfUrl: text('pdf_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  paidAt: timestamp('paid_at'),
}, (table) => ({
  orgIdx: index('invoices_org_idx').on(table.organizationId),
}));

// ============================================================
// API & WEBHOOKS & INTEGRATIONS
// ============================================================

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  keyHash: text('key_hash').notNull(),
  keyPrefix: varchar('key_prefix', { length: 20 }).notNull(),
  scopes: text('scopes').array().default(['read']),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('api_keys_org_idx').on(table.organizationId),
  hashIdx: index('api_keys_hash_idx').on(table.keyHash),
}));

export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  secretHash: text('secret_hash').notNull(),
  events: text('events').array().notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('webhooks_org_idx').on(table.organizationId),
}));

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  webhookId: uuid('webhook_id').notNull().references(() => webhooks.id, { onDelete: 'cascade' }),
  event: varchar('event', { length: 100 }).notNull(),
  payload: jsonb('payload').notNull(),
  responseStatus: integer('response_status'),
  responseBody: text('response_body'),
  attempts: integer('attempts').default(1).notNull(),
  deliveredAt: timestamp('delivered_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  webhookIdx: index('webhook_deliveries_webhook_idx').on(table.webhookId),
}));

export const integrations = pgTable('integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).default('not_configured').notNull(),
  credentialsEncrypted: text('credentials_encrypted'),
  settings: jsonb('settings').default({}),
  lastCheckedAt: timestamp('last_checked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('integrations_org_idx').on(table.organizationId),
  orgProviderIdx: uniqueIndex('integrations_org_provider_idx').on(table.organizationId, table.provider),
}));

// ============================================================
// AGENCY & CLIENT PORTAL
// ============================================================

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  logoUrl: text('logo_url'),
  settings: jsonb('settings').default({}),
  whiteLabel: jsonb('white_label').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('clients_org_idx').on(table.organizationId),
}));

export const clientProjects = pgTable('client_projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  clientIdx: index('client_projects_client_idx').on(table.clientId),
  projectIdx: index('client_projects_project_idx').on(table.projectId),
  uniqueIdx: uniqueIndex('client_projects_unique_idx').on(table.clientId, table.projectId),
}));

// ============================================================
// AUDIT LOGS & FEATURE FLAGS
// ============================================================

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 50 }),
  resourceId: uuid('resource_id'),
  details: jsonb('details'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('audit_logs_org_idx').on(table.organizationId),
  userIdx: index('audit_logs_user_idx').on(table.userId),
  actionIdx: index('audit_logs_action_idx').on(table.action),
}));

export const featureFlags = pgTable('feature_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  enabled: boolean('enabled').default(false).notNull(),
  organizationOverrides: jsonb('organization_overrides').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  keyIdx: uniqueIndex('feature_flags_key_idx').on(table.key),
}));

// ============================================================
// RELATIONS
// ============================================================

export const usersRelations = relations(users, ({ many }) => ({
  organizationMembers: many(organizationMembers),
  sessions: many(sessions),
}));

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  owner: one(users, { fields: [organizations.ownerId], references: [users.id] }),
  members: many(organizationMembers),
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, { fields: [projects.organizationId], references: [organizations.id] }),
  crawlRuns: many(crawlRuns),
  keywords: many(keywords),
  rankings: many(keywordRankings),
}));
