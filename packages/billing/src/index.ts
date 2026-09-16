/**
 * RankForge — Billing, Plans, Credits, Usage
 */

export type PlanTier = 'FREE' | 'STARTER' | 'PRO' | 'AGENCY' | 'ENTERPRISE';

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
  backlinks: number;
  crawlDepth: number;
  historyMonths: number;
}

export interface Plan {
  id: PlanTier;
  name: string;
  description: string;
  priceMonthlyCents: number;
  priceAnnualCents: number;
  limits: PlanLimits;
  features: string[];
  isActive: boolean;
  stripePriceIdMonthly?: string;
  stripePriceIdAnnual?: string;
}

export const PLANS: Record<PlanTier, Plan> = {
  FREE: {
    id: 'FREE',
    name: 'Free',
    description: 'Perfect for trying RankForge',
    priceMonthlyCents: 0,
    priceAnnualCents: 0,
    limits: {
      projects: 1,
      keywords: 10,
      crawledPages: 100,
      rankChecks: 100,
      aiOperations: 10,
      reports: 5,
      users: 1,
      apiRequests: 100,
      competitors: 2,
      backlinks: 100,
      crawlDepth: 2,
      historyMonths: 1,
    },
    features: ['1 Project', '10 Keywords', 'Basic Crawl', 'Community Support'],
    isActive: true,
  },
  STARTER: {
    id: 'STARTER',
    name: 'Starter',
    description: 'For small websites and bloggers',
    priceMonthlyCents: 2900,
    priceAnnualCents: 29000,
    limits: {
      projects: 3,
      keywords: 100,
      crawledPages: 1000,
      rankChecks: 1000,
      aiOperations: 100,
      reports: 20,
      users: 2,
      apiRequests: 1000,
      competitors: 5,
      backlinks: 1000,
      crawlDepth: 3,
      historyMonths: 3,
    },
    features: ['3 Projects', '100 Keywords', 'GSC Integration', 'Email Reports', 'API Access'],
    isActive: true,
  },
  PRO: {
    id: 'PRO',
    name: 'Professional',
    description: 'For growing businesses and SEO pros',
    priceMonthlyCents: 7900,
    priceAnnualCents: 79000,
    limits: {
      projects: 10,
      keywords: 500,
      crawledPages: 10000,
      rankChecks: 5000,
      aiOperations: 500,
      reports: 100,
      users: 5,
      apiRequests: 5000,
      competitors: 10,
      backlinks: 10000,
      crawlDepth: 5,
      historyMonths: 12,
    },
    features: ['10 Projects', '500 Keywords', 'AI Content', 'GEO/AEO Tracking', 'White-label Reports', 'Priority Support'],
    isActive: true,
  },
  AGENCY: {
    id: 'AGENCY',
    name: 'Agency',
    description: 'For agencies managing multiple clients',
    priceMonthlyCents: 19900,
    priceAnnualCents: 199000,
    limits: {
      projects: 50,
      keywords: 2500,
      crawledPages: 50000,
      rankChecks: 25000,
      aiOperations: 2500,
      reports: 500,
      users: 20,
      apiRequests: 25000,
      competitors: 25,
      backlinks: 50000,
      crawlDepth: 10,
      historyMonths: 24,
    },
    features: ['50 Projects', '2500 Keywords', 'Agency Mode', 'Client Portal', 'White-label', 'Team Management', 'API + Webhooks'],
    isActive: true,
  },
  ENTERPRISE: {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    description: 'For large organizations with custom needs',
    priceMonthlyCents: 49900,
    priceAnnualCents: 499000,
    limits: {
      projects: 200,
      keywords: 10000,
      crawledPages: 200000,
      rankChecks: 100000,
      aiOperations: 10000,
      reports: 2000,
      users: 100,
      apiRequests: 100000,
      competitors: 100,
      backlinks: 200000,
      crawlDepth: 15,
      historyMonths: 36,
    },
    features: ['200 Projects', 'Unlimited Keywords (fair use)', 'SSO', 'Custom Integrations', 'Dedicated Support', 'SLA', 'On-premise Option'],
    isActive: true,
  },
};

export function getPlan(tier: PlanTier): Plan {
  return PLANS[tier];
}

export function canPerformAction(currentUsage: Partial<PlanLimits>, plan: Plan, action: keyof PlanLimits, quantity: number = 1): boolean {
  const limit = plan.limits[action];
  const used = currentUsage[action] || 0;
  return used + quantity <= limit;
}

// Credit System
export interface CreditWallet {
  id: string;
  organizationId: string;
  balance: number;
  totalGranted: number;
  totalConsumed: number;
}

export interface CreditTransaction {
  id: string;
  organizationId: string;
  type: 'grant' | 'consumption' | 'refund' | 'expiry';
  amount: number;
  balanceAfter: number;
  description?: string;
  referenceType?: string;
  referenceId?: string;
  createdAt: string;
}

export function calculateCreditCost(operation: string, quantity: number = 1): number {
  const costs: Record<string, number> = {
    crawl_page: 1,
    serp_call: 2,
    keyword_call: 1,
    backlink_call: 2,
    ai_request: 5,
    ai_token_1k: 1,
    report_generation: 3,
    pagespeed_check: 1,
    gsc_sync: 1,
    ga4_sync: 1,
  };
  return (costs[operation] || 1) * quantity;
}

// Usage Metering
export type UsageMetric = 'crawl_pages' | 'serp_calls' | 'keyword_calls' | 'backlink_calls' | 'ai_tokens' | 'ai_requests' | 'reports' | 'api_calls' | 'pagespeed_checks';

export interface UsageRecord {
  organizationId: string;
  projectId?: string;
  metric: UsageMetric;
  quantity: number;
  periodStart: string;
  periodEnd: string;
}

// Stripe Integration
export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  publishableKey: string;
}

export function isStripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export async function createStripeCheckoutSession(organizationId: string, planId: PlanTier, annual: boolean = false): Promise<{ url: string }> {
  if (!isStripeConfigured()) {
    throw new Error('Stripe not configured');
  }

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  const plan = getPlan(planId);
  const priceCents = annual ? plan.priceAnnualCents : plan.priceMonthlyCents;

  if (priceCents === 0) {
    throw new Error('Cannot create checkout for free plan');
  }

  // In production, you'd use pre-created Stripe Price IDs
  // For now, create ad-hoc price
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `RankForge ${plan.name} - ${annual ? 'Annual' : 'Monthly'}`,
        },
        unit_amount: priceCents,
        recurring: {
          interval: annual ? 'year' : 'month',
        },
      },
      quantity: 1,
    }],
    metadata: {
      organizationId,
      planId,
    },
    success_url: `${process.env.APP_URL}/billing?success=true`,
    cancel_url: `${process.env.APP_URL}/billing?canceled=true`,
  });

  return { url: session.url! };
}

export function verifyStripeWebhook(payload: string | Buffer, signature: string): any {
  if (!isStripeConfigured()) throw new Error('Stripe not configured');
  
  const Stripe = require('stripe');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  
  return stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET!);
}
