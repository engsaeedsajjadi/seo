/**
 * Prepaid subscriptions in toman.
 * Settling is idempotent: the payment row is locked and only a pending row can become paid,
 * so a replayed callback, a double click and the reconciler cannot grant anything twice.
 */
import { query, runAsSystem, transaction } from '../db/client.js';
import { config } from '../config/index.js';
import { ApiError } from '../middleware/auth.js';
import { requestPayment, verifyPayment, zarinpalConfig, ZarinpalError } from '../lib/zarinpal.js';
import { sendMail } from './mail.service.js';

const PLAN_ORDER = ['FREE', 'STARTER', 'PRO', 'AGENCY', 'ENTERPRISE'];
const MIN_PAYMENT_TOMAN = 1000;
const GRACE_DAYS = 3;
const REMINDER_DAYS = 3;
/** Past this age Zarinpal no longer settles an unverified payment on our behalf. */
const ABANDON_AFTER_MINUTES = 60;

const addPeriod = (from: Date, interval: string) => {
  const end = new Date(from);
  if (interval === 'year') end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return end;
};

/** Value left in the plan being replaced, from what was actually paid for the current period. */
async function unusedValueToman(organizationId: string): Promise<number> {
  const last = await query(
    `SELECT amount_toman, list_price_toman, verified_at, period_end FROM payments
     WHERE organization_id = $1 AND status = 'paid' AND period_end > NOW() ORDER BY verified_at DESC LIMIT 1`,
    [organizationId],
  );
  const row = last.rows[0];
  if (!row) return 0;
  const start = new Date(row.verified_at).getTime();
  const end = new Date(row.period_end).getTime();
  if (end <= start) return 0;
  return Math.floor(Number(row.list_price_toman) * (end - Date.now()) / (end - start));
}

export const paymentService = {
  isConfigured: () => !!zarinpalConfig(),

  /** Works out the price without touching anything, so the page can show it before paying. */
  async quote(organizationId: string, planId: string, interval: 'month' | 'year') {
    const row = await query(
      `SELECT o.plan AS current_plan, o.subscription_current_period_end AS period_end,
              p.price_monthly_toman, p.price_annual_toman
       FROM organizations o, plans p WHERE o.id = $1 AND p.id = $2 AND p.is_active = TRUE`,
      [organizationId, planId],
    );
    const found = row.rows[0];
    if (!found) throw new ApiError(404, 'NOT_FOUND', 'Plan not found');
    const listPrice = Number(interval === 'year' ? found.price_annual_toman : found.price_monthly_toman);
    if (listPrice <= 0) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'This plan has no toman price yet');

    const active = found.period_end && new Date(found.period_end).getTime() > Date.now();
    const change = PLAN_ORDER.indexOf(planId) - PLAN_ORDER.indexOf(found.current_plan);
    if (active && change < 0) {
      throw new ApiError(409, 'CONFLICT', 'A lower plan can be bought after the current period ends');
    }
    const credit = active && change > 0 ? await unusedValueToman(organizationId) : 0;
    return { listPrice, credit, amount: Math.max(listPrice - credit, MIN_PAYMENT_TOMAN) };
  },

  async start(params: { organizationId: string; userId: string; email?: string; planId: string; interval: 'month' | 'year' }) {
    const cfg = zarinpalConfig();
    if (!cfg) throw new ApiError(503, 'PROVIDER_NOT_CONFIGURED', 'Online payment is not configured');
    const { listPrice, credit, amount } = await this.quote(params.organizationId, params.planId, params.interval);

    return runAsSystem(async () => {
      const created = await query(
        `INSERT INTO payments (organization_id, user_id, plan_id, billing_interval, amount_toman, list_price_toman)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [params.organizationId, params.userId, params.planId, params.interval, amount, listPrice],
      );
      const paymentId = created.rows[0].id;
      try {
        const { authority, url } = await requestPayment(cfg, {
          amountToman: amount,
          description: `اشتراک ${params.planId} رنک‌فورج`,
          callbackUrl: `${config.appUrl.replace(/\/$/, '')}/api/v1/billing/zarinpal/callback`,
          email: params.email,
        });
        await query(`UPDATE payments SET authority = $2, status = 'pending' WHERE id = $1`, [paymentId, authority]);
        return { url, amount, credit, paymentId };
      } catch (error) {
        await query(`UPDATE payments SET status = 'failed' WHERE id = $1`, [paymentId]);
        if (error instanceof ZarinpalError) {
          console.error(JSON.stringify({ level: 'error', msg: 'Zarinpal request failed', code: error.code, reachable: error.reachable }));
          throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Payment gateway is unavailable');
        }
        throw error;
      }
    });
  },

  /** Applies a verified payment exactly once. */
  async settle(paymentId: string, refId: string, cardPan?: string): Promise<void> {
    await transaction(async () => {
      const locked = await query(`SELECT * FROM payments WHERE id = $1 FOR UPDATE`, [paymentId]);
      const payment = locked.rows[0];
      if (!payment || payment.status === 'paid') return;

      const org = await query(`SELECT plan, subscription_current_period_end AS period_end FROM organizations WHERE id = $1 FOR UPDATE`, [payment.organization_id]);
      const current = org.rows[0];
      // Renewing early adds to the time already paid for. A plan change starts today:
      // the unused value of the old plan was already taken off the price.
      const renewing = current.plan === payment.plan_id && current.period_end && new Date(current.period_end).getTime() > Date.now();
      const periodEnd = addPeriod(renewing ? new Date(current.period_end) : new Date(), payment.billing_interval);

      await query(`UPDATE payments SET status = 'paid', ref_id = $2, card_pan = $3, verified_at = NOW(), period_end = $4 WHERE id = $1`, [paymentId, refId, cardPan ?? null, periodEnd]);
      await query(`UPDATE organizations SET plan = $2, subscription_status = 'active', subscription_current_period_end = $3, renewal_reminder_sent_at = NULL, updated_at = NOW() WHERE id = $1`,
        [payment.organization_id, payment.plan_id, periodEnd]);

      const plan = await query(`SELECT monthly_credits FROM plans WHERE id = $1`, [payment.plan_id]);
      const credits = Number(plan.rows[0]?.monthly_credits || 0) * (payment.billing_interval === 'year' ? 12 : 1);
      if (credits > 0) {
        const wallet = await query(
          `UPDATE credit_wallets SET balance = balance + $2, total_granted = total_granted + $2, updated_at = NOW() WHERE organization_id = $1 RETURNING balance`,
          [payment.organization_id, credits],
        );
        if (wallet.rows[0]) {
          await query(
            `INSERT INTO credit_transactions (organization_id, type, amount, balance_after, description, reference_type, reference_id, idempotency_key)
             VALUES ($1, 'grant', $2, $3, $4, 'payment', $5, $6)`,
            [payment.organization_id, credits, wallet.rows[0].balance, `اعتبار پلن ${payment.plan_id}`, paymentId, `payment_grant_${paymentId}`],
          );
        }
      }
      await query(
        `INSERT INTO audit_logs (organization_id, user_id, action, resource_type, resource_id, details) VALUES ($1, $2, 'billing.payment_settled', 'payment', $3, $4)`,
        [payment.organization_id, payment.user_id, paymentId, JSON.stringify({ planId: payment.plan_id, interval: payment.billing_interval, amountToman: payment.amount_toman, refId })],
      );
    });
  },

  /** Asks the gateway about one pending payment. Returns the result to show the customer. */
  async verifyAndSettle(payment: { id: string; authority: string; amount_toman: string | number; created_at: Date | string }): Promise<'paid' | 'failed' | 'pending'> {
    const cfg = zarinpalConfig();
    if (!cfg) return 'pending';
    try {
      const result = await verifyPayment(cfg, { amountToman: Number(payment.amount_toman), authority: payment.authority });
      if (result.outcome === 'paid') {
        await this.settle(payment.id, result.refId, result.cardPan);
        return 'paid';
      }
      const ageMinutes = (Date.now() - new Date(payment.created_at).getTime()) / 60000;
      if (ageMinutes < ABANDON_AFTER_MINUTES) return 'pending';
      await query(`UPDATE payments SET status = 'failed' WHERE id = $1 AND status = 'pending'`, [payment.id]);
      return 'failed';
    } catch (error) {
      if (error instanceof ZarinpalError) return 'pending';
      throw error;
    }
  },

  /** The customer's return from the gateway. Status only decides whether verifying is worth trying. */
  async handleCallback(authority: string, status: string): Promise<{ result: 'paid' | 'failed' | 'pending'; refId?: string }> {
    const found = await query(`SELECT id, authority, amount_toman, created_at, status, ref_id FROM payments WHERE authority = $1`, [authority]);
    const payment = found.rows[0];
    if (!payment) return { result: 'failed' };
    if (payment.status === 'paid') return { result: 'paid', refId: payment.ref_id };
    if (payment.status === 'failed') return { result: 'failed' };
    if (status !== 'OK') {
      await query(`UPDATE payments SET status = 'failed' WHERE id = $1 AND status = 'pending'`, [payment.id]);
      return { result: 'failed' };
    }
    const result = await this.verifyAndSettle(payment);
    if (result !== 'paid') return { result };
    const paid = await query(`SELECT ref_id FROM payments WHERE id = $1`, [payment.id]);
    return { result, refId: paid.rows[0]?.ref_id };
  },

  /** Catches payments whose customer closed the browser, or whose verify call failed. */
  async reconcilePending(): Promise<number> {
    const open = await query(
      `SELECT id, authority, amount_toman, created_at FROM payments
       WHERE status = 'pending' AND authority IS NOT NULL AND created_at < NOW() - make_interval(secs => $1) ORDER BY created_at LIMIT 50`,
      [Number(process.env.PAYMENT_RECONCILE_AFTER_SECONDS || 120)],
    );
    let settled = 0;
    for (const payment of open.rows) if ((await this.verifyAndSettle(payment)) === 'paid') settled++;
    return settled;
  },

  /** Reminds before a period ends, gives a grace period, then returns the plan to FREE. */
  async processExpirations(): Promise<{ reminded: number; expired: number }> {
    const appUrl = config.appUrl.replace(/\/$/, '');
    // Stripe subscriptions renew themselves, so only prepaid periods are handled here.
    const due = await query(
      `UPDATE organizations o SET renewal_reminder_sent_at = NOW()
       FROM users u
       WHERE u.id = o.owner_id AND o.deleted_at IS NULL AND o.plan <> 'FREE' AND o.stripe_subscription_id IS NULL
         AND o.renewal_reminder_sent_at IS NULL
         AND o.subscription_current_period_end > NOW()
         AND o.subscription_current_period_end <= NOW() + make_interval(days => ${REMINDER_DAYS})
       RETURNING u.email, o.plan`,
    );
    for (const org of due.rows) {
      await sendMail(org.email, 'اشتراک رنک‌فورج به‌زودی پایان می‌یابد',
        `اشتراک پلن ${org.plan} شما تا ${REMINDER_DAYS} روز دیگر پایان می‌یابد. برای ادامه، آن را تمدید کنید:\n${appUrl}/#/billing`);
    }

    await query(
      `UPDATE organizations SET subscription_status = 'past_due', updated_at = NOW()
       WHERE plan <> 'FREE' AND stripe_subscription_id IS NULL AND subscription_status = 'active'
         AND subscription_current_period_end <= NOW()`,
    );
    const expired = await query(
      `UPDATE organizations o SET plan = 'FREE', subscription_status = 'expired', updated_at = NOW()
       FROM users u
       WHERE u.id = o.owner_id AND o.plan <> 'FREE' AND o.stripe_subscription_id IS NULL
         AND o.subscription_current_period_end <= NOW() - make_interval(days => ${GRACE_DAYS})
       RETURNING o.id, u.email`,
    );
    for (const org of expired.rows) {
      await query(`INSERT INTO audit_logs (organization_id, action, resource_type, resource_id) VALUES ($1, 'billing.subscription_expired', 'organization', $1)`, [org.id]);
      await sendMail(org.email, 'اشتراک رنک‌فورج پایان یافت',
        `اشتراک شما پایان یافت و حساب به پلن رایگان برگشت. داده‌های شما حذف نشده‌اند. برای تمدید:\n${appUrl}/#/billing`);
    }
    return { reminded: due.rows.length, expired: expired.rows.length };
  },

  startMaintenance() {
    const every = Number(process.env.BILLING_MAINTENANCE_MS || 300000);
    const run = async () => {
      try {
        await this.reconcilePending();
        await this.processExpirations();
      } catch (error) {
        console.error(JSON.stringify({ level: 'error', msg: 'Billing maintenance failed', error: error instanceof Error ? error.message : String(error) }));
      }
    };
    const timer = setInterval(run, every);
    timer.unref();
    return timer;
  },
};
