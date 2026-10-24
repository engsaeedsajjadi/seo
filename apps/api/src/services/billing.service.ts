/**
 * RankForge — Billing Service (Stripe)
 *
 * Owns the money path end to end:
 *   POST /billing/checkout  → Stripe Checkout Session (subscription)
 *   POST /billing/portal    → Stripe Customer Portal session
 *   POST /billing/webhook   → signature-verified events applied to
 *                             organizations + invoices + credit ledger
 *
 * Webhook exactly-once design (two independent layers):
 *   1. `stripe_events.event_id` is UNIQUE. The handler claims the
 *      event with INSERT … ON CONFLICT DO NOTHING; an already-claimed
 *      event whose `processed` flag is set is acked as a duplicate.
 *      An event claimed but NOT processed (an earlier attempt crashed
 *      mid-flight) is processed on redelivery. On handler error the
 *      flag stays false and the route answers 500 so Stripe retries.
 *   2. Credit grants carry their own ledger idempotency key
 *      (`stripe_invoice_<invoiceId>`; credit_transactions.idempotency_key
 *      is UNIQUE and grantCredits checks it first), so even a re-run of
 *      the invoice handler can never double-grant.
 *
 * Grants happen ONLY on `invoice.payment_succeeded` — never on
 * checkout.session.completed — so the first payment (which fires both)
 * grants exactly once.
 *
 * Org resolution, in order: metadata.organizationId (we stamp it on
 * the Checkout Session and, via subscription_data, on the Subscription
 * itself) → organizations.stripe_customer_id. Events that resolve to
 * no organization are recorded and acked without effects.
 */

import type Stripe from 'stripe';
import { config } from '../config/index.js';
import { query } from '../db/client.js';
import { ApiError } from '../middleware/auth.js';
import { organizationRepository } from '../repositories/organization.repository.js';
import { creditRepository } from '../repositories/credit.repository.js';
import { auditLogRepository } from '../repositories/audit-log.repository.js';
import {
  createStripeClient,
  isStripeConfigured,
  resolveStripePriceId,
  mapSubscriptionStatus,
  invoiceBillingInterval,
  creditsForPaidInvoice,
  planIdForPriceId,
  unixToDate,
  type BillingInterval,
  type FetchFn,
} from '../lib/stripe.js';

export interface PlanRow {
  id: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  priceAnnualCents: number;
  limits: any;
  features: any;
  isActive: boolean;
  stripePriceIdMonthly: string | null;
  stripePriceIdAnnual: string | null;
  monthlyCredits: number;
}

const PLAN_SELECT = `id, name, description, price_monthly_cents AS "priceMonthlyCents",
  price_annual_cents AS "priceAnnualCents", limits, features, is_active AS "isActive",
  stripe_price_id_monthly AS "stripePriceIdMonthly", stripe_price_id_annual AS "stripePriceIdAnnual",
  monthly_credits AS "monthlyCredits" FROM plans`;

export const billingService = {
  async listPlans(): Promise<PlanRow[]> {
    const result = await query(`SELECT ${PLAN_SELECT} WHERE is_active = TRUE ORDER BY price_monthly_cents ASC`);
    return result.rows;
  },

  async getPlan(planId: string): Promise<PlanRow | null> {
    const result = await query(`SELECT ${PLAN_SELECT} WHERE id = $1`, [planId]);
    return result.rows[0] || null;
  },

  // ==========================================================
  // CHECKOUT
  // ==========================================================

  async createCheckoutSession(params: {
    organizationId: string;
    planId: string;
    interval: BillingInterval;
    fetchFn?: FetchFn;
  }): Promise<{ url: string; sessionId: string }> {
    if (!isStripeConfigured()) {
      throw new ApiError(503, 'PROVIDER_NOT_CONFIGURED', 'Stripe is not configured (STRIPE_SECRET_KEY missing)');
    }
    const org = await organizationRepository.findById(params.organizationId);
    if (!org) throw new ApiError(404, 'NOT_FOUND', 'Organization not found');

    const plan = await this.getPlan(params.planId);
    if (!plan || !plan.isActive) {
      throw new ApiError(404, 'NOT_FOUND', `Plan ${params.planId} not found`);
    }
    const priceCents = params.interval === 'year' ? plan.priceAnnualCents : plan.priceMonthlyCents;
    if (priceCents <= 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', `Plan ${plan.id} is free — no checkout required`);
    }
    const priceId = resolveStripePriceId(plan, params.interval);
    if (!priceId) {
      throw new ApiError(
        503,
        'PROVIDER_NOT_CONFIGURED',
        `No Stripe price configured for plan ${plan.id} (${params.interval}). ` +
        `Set plans.stripe_price_id_${params.interval === 'year' ? 'annual' : 'monthly'} or env STRIPE_PRICE_${plan.id}_${params.interval === 'year' ? 'ANNUAL' : 'MONTHLY'}.`,
      );
    }

    const client = createStripeClient({ fetchFn: params.fetchFn });

    // One Stripe Customer per organization, created once and reused.
    let customerId = org.stripeCustomerId;
    if (!customerId) {
      const owner = await query(`SELECT email, name FROM users WHERE id = $1`, [org.ownerId]);
      const customer = await client.createCustomer({
        email: owner.rows[0]?.email,
        name: org.name,
        organizationId: org.id,
      });
      customerId = customer.id;
      await organizationRepository.update(org.id, { stripeCustomerId: customerId });
    }

    const session = await client.createCheckoutSession({
      customerId,
      priceId,
      organizationId: org.id,
      planId: plan.id,
      interval: params.interval,
      successUrl: `${config.appUrl}/billing?checkout=success`,
      cancelUrl: `${config.appUrl}/billing?checkout=cancelled`,
    });

    await auditLogRepository.create({
      organizationId: org.id,
      action: 'billing.checkout_created',
      resourceType: 'stripe_checkout_session',
      details: { planId: plan.id, interval: params.interval, sessionId: session.id, customerId },
    });

    return { url: session.url, sessionId: session.id };
  },

  // ==========================================================
  // CUSTOMER PORTAL
  // ==========================================================

  async createPortalSession(params: { organizationId: string; fetchFn?: FetchFn }): Promise<{ url: string }> {
    if (!isStripeConfigured()) {
      throw new ApiError(503, 'PROVIDER_NOT_CONFIGURED', 'Stripe is not configured (STRIPE_SECRET_KEY missing)');
    }
    const org = await organizationRepository.findById(params.organizationId);
    if (!org) throw new ApiError(404, 'NOT_FOUND', 'Organization not found');
    if (!org.stripeCustomerId) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Organization has no Stripe customer yet — complete a checkout first');
    }
    const client = createStripeClient({ fetchFn: params.fetchFn });
    const session = await client.createPortalSession({
      customerId: org.stripeCustomerId,
      returnUrl: `${config.appUrl}/billing`,
    });
    return { url: session.url };
  },

  // ==========================================================
  // WEBHOOK PROCESSING
  // ==========================================================

  async resolveOrganizationId(hints: { organizationId?: string | null; customerId?: string | null }): Promise<string | null> {
    if (hints.organizationId) {
      const org = await organizationRepository.findById(hints.organizationId);
      if (org) return org.id;
    }
    if (hints.customerId) {
      const result = await query(
        `SELECT id FROM organizations WHERE stripe_customer_id = $1 AND deleted_at IS NULL`,
        [hints.customerId],
      );
      if (result.rows.length > 0) return result.rows[0].id;
    }
    return null;
  },

  /**
   * Claim + process one verified Stripe event.
   * Returns { duplicate: true } when the event was already fully
   * processed; { ignored: true } for event types we don't act on.
   * Throws on handler failure (event stays unprocessed → HTTP 500 →
   * Stripe redelivers).
   */
  async processStripeEvent(event: Stripe.Event): Promise<{ duplicate?: boolean; ignored?: boolean }> {
    const claim = await query(
      `INSERT INTO stripe_events (event_id, type, data) VALUES ($1, $2, $3)
       ON CONFLICT (event_id) DO NOTHING RETURNING id`,
      [event.id, event.type, JSON.stringify(event)],
    );
    if (claim.rows.length === 0) {
      const existing = await query(`SELECT processed FROM stripe_events WHERE event_id = $1`, [event.id]);
      if (existing.rows[0]?.processed) return { duplicate: true };
      // Claimed by an earlier attempt that never finished — fall
      // through and process it now (effects are idempotent).
    }

    await this.applyEvent(event);

    await query(`UPDATE stripe_events SET processed = TRUE WHERE event_id = $1`, [event.id]);
    return {};
  },

  async applyEvent(event: Stripe.Event): Promise<{ ignored?: boolean }> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        return {};
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.onSubscriptionUpsert(event.data.object as Stripe.Subscription);
        return {};
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(event.data.object as Stripe.Subscription);
        return {};
      case 'invoice.payment_succeeded':
        await this.onInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        return {};
      case 'invoice.payment_failed':
        await this.onInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        return {};
      default:
        return { ignored: true };
    }
  },

  async onCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    if (session.mode !== 'subscription') return;
    const organizationId = await this.resolveOrganizationId({
      organizationId: session.metadata?.organizationId || session.client_reference_id,
      customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
    });
    if (!organizationId) return;

    const planId = session.metadata?.planId;
    const updates: Parameters<typeof organizationRepository.update>[1] = {
      subscriptionStatus: 'active',
    };
    if (planId) {
      const plan = await this.getPlan(planId);
      if (plan) updates.plan = plan.id;
    }
    if (typeof session.customer === 'string') updates.stripeCustomerId = session.customer;
    if (typeof session.subscription === 'string') updates.stripeSubscriptionId = session.subscription;
    await organizationRepository.update(organizationId, updates);

    await auditLogRepository.create({
      organizationId,
      action: 'billing.checkout_completed',
      resourceType: 'stripe_checkout_session',
      details: { sessionId: session.id, planId: planId || null, subscriptionId: updates.stripeSubscriptionId || null },
    });
  },

  async onSubscriptionUpsert(subscription: Stripe.Subscription): Promise<void> {
    const organizationId = await this.resolveOrganizationId({
      organizationId: subscription.metadata?.organizationId,
      customerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
    });
    if (!organizationId) return;

    const status = mapSubscriptionStatus(subscription.status);
    const updates: Parameters<typeof organizationRepository.update>[1] = {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: status,
      subscriptionCurrentPeriodEnd: unixToDate((subscription as any).current_period_end),
    };
    if (typeof subscription.customer === 'string') updates.stripeCustomerId = subscription.customer;

    // Plan follows the subscription while it is in a live state:
    // metadata first (we stamp it at checkout), then price-id match.
    if (status === 'active' || status === 'trialing' || status === 'past_due') {
      let planId = subscription.metadata?.planId || null;
      if (!planId) {
        const priceId = (subscription.items?.data?.[0] as any)?.price?.id;
        if (priceId) planId = planIdForPriceId(priceId, await this.listPlans());
      }
      if (planId) {
        const plan = await this.getPlan(planId);
        if (plan) updates.plan = plan.id;
      }
    }

    await organizationRepository.update(organizationId, updates);
    await auditLogRepository.create({
      organizationId,
      action: 'billing.subscription_updated',
      resourceType: 'stripe_subscription',
      details: { subscriptionId: subscription.id, status, plan: updates.plan || null },
    });
  },

  async onSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const organizationId = await this.resolveOrganizationId({
      organizationId: subscription.metadata?.organizationId,
      customerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
    });
    if (!organizationId) return;

    await organizationRepository.update(organizationId, {
      plan: 'FREE',
      subscriptionStatus: 'canceled',
      subscriptionCurrentPeriodEnd: null,
    });
    await auditLogRepository.create({
      organizationId,
      action: 'billing.subscription_canceled',
      resourceType: 'stripe_subscription',
      details: { subscriptionId: subscription.id },
    });
  },

  async upsertInvoice(organizationId: string, invoice: Stripe.Invoice, status: 'paid' | 'open'): Promise<void> {
    const periodStart = unixToDate((invoice as any).period_start);
    const periodEnd = unixToDate((invoice as any).period_end);
    await query(
      `INSERT INTO invoices (organization_id, stripe_invoice_id, amount_cents, currency, status, period_start, period_end, pdf_url, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (stripe_invoice_id) DO UPDATE SET
         amount_cents = EXCLUDED.amount_cents, status = EXCLUDED.status,
         period_start = EXCLUDED.period_start, period_end = EXCLUDED.period_end,
         pdf_url = EXCLUDED.pdf_url, paid_at = COALESCE(invoices.paid_at, EXCLUDED.paid_at)`,
      [
        organizationId,
        invoice.id,
        status === 'paid' ? ((invoice as any).amount_paid ?? 0) : ((invoice as any).amount_due ?? 0),
        (invoice as any).currency || 'usd',
        status,
        periodStart ? periodStart.toISOString().slice(0, 10) : null,
        periodEnd ? periodEnd.toISOString().slice(0, 10) : null,
        (invoice as any).invoice_pdf || null,
        status === 'paid' ? new Date(((invoice as any).status_transitions?.paid_at || invoice.created) * 1000) : null,
      ],
    );
  },

  async onInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    const organizationId = await this.resolveOrganizationId({
      customerId: typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer as any)?.id,
    });
    if (!organizationId) return;

    await this.upsertInvoice(organizationId, invoice, 'paid');

    // A paid invoice revives the subscription state (e.g. after
    // past_due) and carries the freshest period end we have.
    const periodEnd = unixToDate((invoice as any).period_end);
    const updates: Parameters<typeof organizationRepository.update>[1] = { subscriptionStatus: 'active' };
    if (typeof invoice.subscription === 'string') updates.stripeSubscriptionId = invoice.subscription;
    if (periodEnd) updates.subscriptionCurrentPeriodEnd = periodEnd;
    await organizationRepository.update(organizationId, updates);

    // Monthly credit allotment — only for subscription invoices, only
    // once per invoice (ledger idempotency key), never on FREE (0).
    if (invoice.subscription) {
      const org = await organizationRepository.findById(organizationId);
      const plan = org ? await this.getPlan(org.plan) : null;
      const grant = creditsForPaidInvoice(plan?.monthlyCredits || 0, invoiceBillingInterval(invoice));
      if (grant > 0) {
        await creditRepository.grantCredits(
          organizationId,
          grant,
          `Stripe subscription payment — invoice ${invoice.id} (${org?.plan} plan allotment)`,
          'stripe_invoice',
          undefined,
          `stripe_invoice_${invoice.id}`,
        );
      }
    }

    await auditLogRepository.create({
      organizationId,
      action: 'billing.payment_succeeded',
      resourceType: 'stripe_invoice',
      details: { invoiceId: invoice.id, amountPaid: (invoice as any).amount_paid ?? null, currency: (invoice as any).currency || 'usd' },
    });
  },

  async onInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const organizationId = await this.resolveOrganizationId({
      customerId: typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer as any)?.id,
    });
    if (!organizationId) return;

    await this.upsertInvoice(organizationId, invoice, 'open');
    await organizationRepository.update(organizationId, { subscriptionStatus: 'past_due' });

    await auditLogRepository.create({
      organizationId,
      action: 'billing.payment_failed',
      resourceType: 'stripe_invoice',
      details: { invoiceId: invoice.id, amountDue: (invoice as any).amount_due ?? null, attemptCount: (invoice as any).attempt_count ?? null },
    });
  },
};
