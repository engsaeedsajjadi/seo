/**
 * RankForge — Stripe billing client (API app)
 *
 * Real Stripe integration, replacing the phase-0 fiction in which the
 * webhook "verified the signature format" and packages/billing sat
 * imported-by-nobody:
 *
 * - Checkout / Customer / Customer-Portal calls go to the real Stripe
 *   REST API (form-encoded POSTs, Bearer secret key) through an
 *   injectable `fetch`, the same convention as lib/google.ts and
 *   lib/providers.ts, so tests can capture exact request shapes.
 * - Webhook signature verification uses the official Stripe SDK's
 *   `webhooks.constructEvent` against the RAW request body — real
 *   HMAC-SHA256 + timestamp-tolerance verification, not a format check.
 * - Plan → price mapping: the plans table is canonical
 *   (`stripe_price_id_monthly` / `stripe_price_id_annual` columns);
 *   `STRIPE_PRICE_<PLAN>_<MONTHLY|ANNUAL>` env vars are the fallback
 *   for operators who prefer env-managed config.
 * - No fake data: without STRIPE_SECRET_KEY the client reports
 *   "not configured"; without a webhook secret, webhook payloads are
 *   rejected, never processed unverified.
 */

import Stripe from 'stripe';
import { config } from '../config/index.js';

export type FetchFn = (url: string, init?: any) => Promise<any>;

export class StripeApiError extends Error {
  httpStatus?: number;
  providerCode?: string;
  constructor(message: string, opts: { httpStatus?: number; providerCode?: string } = {}) {
    super(message);
    this.name = 'StripeApiError';
    this.httpStatus = opts.httpStatus;
    this.providerCode = opts.providerCode;
  }
}

export type BillingInterval = 'month' | 'year';

export function isStripeConfigured(): boolean {
  return !!config.providers.stripe.secretKey;
}

export function isStripeWebhookConfigured(): boolean {
  return !!config.providers.stripe.webhookSecret;
}

// ============================================================
// STRIPE FORM ENCODING — api.stripe.com speaks
// application/x-www-form-urlencoded with bracket notation:
//   line_items[0][price]=price_…&metadata[organizationId]=…
// ============================================================

export function formEncode(value: any, prefix?: string, out: string[] = []): string[] {
  if (value === undefined || value === null) return out;
  if (Array.isArray(value)) {
    value.forEach((item, i) => formEncode(item, `${prefix}[${i}]`, out));
    return out;
  }
  if (typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      formEncode(v, prefix ? `${prefix}[${key}]` : key, out);
    }
    return out;
  }
  out.push(`${encodeURIComponent(prefix || '')}=${encodeURIComponent(String(value))}`);
  return out;
}

export function toFormBody(params: Record<string, any>): string {
  return formEncode(params).join('&');
}

// ============================================================
// PLAN → PRICE RESOLUTION + EVENT MATH (pure, unit-tested)
// ============================================================

export interface PlanPriceSource {
  id: string;
  stripePriceIdMonthly?: string | null;
  stripePriceIdAnnual?: string | null;
}

/**
 * Column value wins; env fallback `STRIPE_PRICE_<PLAN>_MONTHLY|ANNUAL`;
 * null when neither is set (caller reports NOT_CONFIGURED — a checkout
 * must never invent a price).
 */
export function resolveStripePriceId(
  plan: PlanPriceSource,
  interval: BillingInterval,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const column = interval === 'year' ? plan.stripePriceIdAnnual : plan.stripePriceIdMonthly;
  if (column) return column;
  const envKey = `STRIPE_PRICE_${plan.id}_${interval === 'year' ? 'ANNUAL' : 'MONTHLY'}`;
  return env[envKey] || null;
}

/** Stripe subscription statuses that fit organizations.subscription_status. */
const KNOWN_SUBSCRIPTION_STATUSES = new Set([
  'active', 'trialing', 'past_due', 'canceled', 'unpaid',
  'incomplete', 'incomplete_expired', 'paused',
]);

export function mapSubscriptionStatus(status: string | undefined | null): string {
  if (status && KNOWN_SUBSCRIPTION_STATUSES.has(status)) return status;
  return 'incomplete';
}

/**
 * Billing interval carried by a paid invoice, from its first line's
 * price. Null when the invoice has no priced lines (caller treats the
 * grant as monthly).
 */
export function invoiceBillingInterval(invoice: any): BillingInterval | null {
  const interval = invoice?.lines?.data?.[0]?.price?.recurring?.interval;
  if (interval === 'year' || interval === 'month') return interval;
  const planInterval = invoice?.lines?.data?.[0]?.plan?.interval;
  if (planInterval === 'year' || planInterval === 'month') return planInterval;
  return null;
}

/**
 * Credits granted for one paid invoice: the plan's monthly allotment,
 * ×12 when the invoice bills a full year up front.
 */
export function creditsForPaidInvoice(monthlyCredits: number, interval: BillingInterval | null): number {
  if (!monthlyCredits || monthlyCredits <= 0) return 0;
  return interval === 'year' ? monthlyCredits * 12 : monthlyCredits;
}

/**
 * Resolve which plan a subscription's price belongs to, by matching
 * its price id against the plans table's Stripe price columns.
 */
export function planIdForPriceId(
  priceId: string | null | undefined,
  plans: PlanPriceSource[],
): string | null {
  if (!priceId) return null;
  for (const plan of plans) {
    if (plan.stripePriceIdMonthly === priceId || plan.stripePriceIdAnnual === priceId) {
      return plan.id;
    }
  }
  return null;
}

export function unixToDate(unixSeconds: number | null | undefined): Date | null {
  if (!unixSeconds || typeof unixSeconds !== 'number') return null;
  return new Date(unixSeconds * 1000);
}

// ============================================================
// WEBHOOK SIGNATURE VERIFICATION — the official SDK's
// constructEvent over the exact raw bytes Stripe sent.
// Throws StripeApiError(400) on any verification failure.
// ============================================================

export function verifyStripeWebhookEvent(
  rawBody: Buffer | string,
  signatureHeader: string,
  webhookSecret: string,
  secretKey?: string,
): Stripe.Event {
  // constructEvent is pure crypto (HMAC + tolerance) and never uses
  // the API key; a placeholder keeps the SDK constructible when only
  // the webhook secret is deployed.
  const stripe = new Stripe(secretKey || 'sk_test_webhook_verification_only');
  try {
    return stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
  } catch (err: any) {
    throw new StripeApiError(`Stripe webhook signature verification failed: ${err.message}`, {
      httpStatus: 400,
      providerCode: 'SIGNATURE_VERIFICATION_FAILED',
    });
  }
}

// ============================================================
// STRIPE REST CLIENT — injectable fetch, real API shapes
// ============================================================

export interface CreateCheckoutSessionParams {
  customerId: string;
  priceId: string;
  organizationId: string;
  planId: string;
  interval: BillingInterval;
  successUrl: string;
  cancelUrl: string;
}

export class StripeClient {
  private readonly secretKey: string;
  private readonly apiBase: string;
  private readonly fetchFn: FetchFn;

  constructor(opts: { secretKey?: string; apiBase?: string; fetchFn?: FetchFn } = {}) {
    this.secretKey = opts.secretKey ?? config.providers.stripe.secretKey;
    this.apiBase = (opts.apiBase ?? config.providers.stripe.apiBase).replace(/\/$/, '');
    this.fetchFn = opts.fetchFn || ((url: string, init?: any) => fetch(url, init));
  }

  isConfigured(): boolean {
    return !!this.secretKey;
  }

  private async request<T = any>(path: string, params: Record<string, any>): Promise<T> {
    if (!this.secretKey) {
      throw new StripeApiError('Stripe is not configured (STRIPE_SECRET_KEY missing)', {
        httpStatus: 503,
        providerCode: 'PROVIDER_NOT_CONFIGURED',
      });
    }
    const res = await this.fetchFn(`${this.apiBase}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: toFormBody(params),
    });
    const body = await res.json().catch(() => null);
    const status = typeof res.status === 'number' ? res.status : (res.ok ? 200 : 500);
    if (status < 200 || status >= 300 || body?.error) {
      const providerMessage = body?.error?.message || `Stripe API request failed (HTTP ${status})`;
      throw new StripeApiError(`Stripe API error: ${providerMessage}`, {
        httpStatus: status,
        providerCode: body?.error?.code || body?.error?.type || 'STRIPE_API_ERROR',
      });
    }
    return body as T;
  }

  /** POST /v1/customers — one Stripe Customer per organization. */
  async createCustomer(params: { email?: string; name?: string; organizationId: string }): Promise<{ id: string }> {
    const body: Record<string, any> = {
      metadata: { organizationId: params.organizationId },
    };
    if (params.email) body.email = params.email;
    if (params.name) body.name = params.name;
    body.description = `RankForge organization ${params.organizationId}`;
    const customer = await this.request<{ id: string }>('/v1/customers', body);
    return { id: customer.id };
  }

  /** POST /v1/checkout/sessions — subscription mode, org+plan in metadata (session AND subscription). */
  async createCheckoutSession(params: CreateCheckoutSessionParams): Promise<{ id: string; url: string }> {
    const session = await this.request<{ id: string; url: string }>('/v1/checkout/sessions', {
      mode: 'subscription',
      customer: params.customerId,
      client_reference_id: params.organizationId,
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        organizationId: params.organizationId,
        planId: params.planId,
        interval: params.interval,
      },
      subscription_data: {
        metadata: {
          organizationId: params.organizationId,
          planId: params.planId,
          interval: params.interval,
        },
      },
    });
    return { id: session.id, url: session.url };
  }

  /** POST /v1/billing_portal/sessions — self-serve subscription management. */
  async createPortalSession(params: { customerId: string; returnUrl: string }): Promise<{ id: string; url: string }> {
    const session = await this.request<{ id: string; url: string }>('/v1/billing_portal/sessions', {
      customer: params.customerId,
      return_url: params.returnUrl,
    });
    return { id: session.id, url: session.url };
  }
}

export function createStripeClient(opts: { fetchFn?: FetchFn } = {}): StripeClient {
  return new StripeClient(opts);
}
