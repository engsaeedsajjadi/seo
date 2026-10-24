/**
 * RankForge — Stripe Billing (phase 5): integration test
 *
 * Full loop over REAL HTTP against the real Express app + real
 * PostgreSQL, with Stripe itself replaced by a local mock of
 * api.stripe.com (via STRIPE_API_BASE_URL) that captures requests:
 *
 *   signup (real) → POST /billing/checkout → mock Stripe asserts the
 *   customer + session request shapes, org row gains the customer id
 *   → locally-SIGNED webhook fixtures POSTed to /billing/webhook:
 *     checkout.session.completed  → plan/subscription linked
 *     customer.subscription.updated → renewal date stored
 *     invoice.payment_succeeded   → invoice row + monthly credit
 *                                   grant, EXACTLY once on replay
 *     invoice.payment_failed      → status past_due
 *     customer.subscription.deleted → plan FREE / canceled
 *   → unsigned and tampered deliveries: HTTP 400 and ZERO state change
 *
 * Signatures are computed locally (HMAC-SHA256 over
 * `${timestamp}.${payload}` with the test webhook secret), so the
 * route's real SDK constructEvent verification is exercised end to end.
 *
 * Requires DATABASE_URL (a migrated + seeded RankForge schema). When
 * DATABASE_URL is not set, prints a skip notice and exits 0 — same
 * offline-tolerance convention as the other integration suites.
 *
 * All Stripe ids (events, invoices, subscription, customer) are
 * run-scoped: stripe_events / invoices / credit idempotency keys are
 * global, so fixed ids would make a second run against the same
 * database collide with the first run's processed events.
 */

import assert from 'assert';
import crypto from 'crypto';
import http from 'http';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.log('⏭️  DATABASE_URL not set — stripe-billing integration test skipped (offline mode)');
  process.exit(0);
}

console.log('Testing Stripe billing loop against a real database + real HTTP app (mocked Stripe API)...');

// ---------------------------------------------------------------
// Mock Stripe API (must exist before the app config singleton
// reads STRIPE_API_BASE_URL)
// ---------------------------------------------------------------

interface CapturedStripeCall { path: string; params: URLSearchParams }
const stripeCalls: CapturedStripeCall[] = [];
let customerSeq = 0;

const mockStripe = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    const path = new URL(req.url || '/', 'http://stripe.mock').pathname;
    stripeCalls.push({ path, params: new URLSearchParams(body) });
    res.setHeader('Content-Type', 'application/json');
    if (path === '/v1/customers') {
      customerSeq += 1;
      res.end(JSON.stringify({ id: `cus_mock_${process.pid}_${customerSeq}`, object: 'customer' }));
    } else if (path === '/v1/checkout/sessions') {
      res.end(JSON.stringify({ id: 'cs_mock_1', object: 'checkout.session', url: 'https://checkout.stripe.com/c/pay/cs_mock_1' }));
    } else if (path === '/v1/billing_portal/sessions') {
      res.end(JSON.stringify({ id: 'bps_mock_1', object: 'billing_portal.session', url: 'https://billing.stripe.com/p/session/bps_mock_1' }));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: { message: `mock: unknown path ${path}`, code: 'resource_missing' } }));
    }
  });
});
await new Promise<void>((resolve) => mockStripe.listen(0, '127.0.0.1', resolve));
const mockStripePort = (mockStripe.address() as any).port;

// Env must be set before importing API modules (config is a singleton).
const WEBHOOK_SECRET = '<redacted>';
process.env.STRIPE_SECRET_KEY = 'sk_test_integration';
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.STRIPE_API_BASE_URL = `http://127.0.0.1:${mockStripePort}`;
process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_env_it';
process.env.APP_URL = 'http://app.test';

const { Pool } = await import('pg');
const pool = new Pool({ connectionString: DATABASE_URL });
const query = (text: string, params?: any[]) => pool.query(text, params);

const { createApp } = await import('../../apps/api/src/app.js');
const { closePool } = await import('../../apps/api/src/db/client.js');

const app = createApp();
const server = await new Promise<http.Server>((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${(server.address() as any).port}`;

async function api(path: string, opts: { method?: string; token?: string; body?: any; headers?: Record<string, string>; rawBody?: string } = {}) {
  const res = await fetch(`${base}${path}`, {
    method: opts.method || 'GET',
    headers: {
      ...(opts.rawBody !== undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers || {}),
    },
    body: opts.rawBody !== undefined ? opts.rawBody : (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* webhook errors are JSON too; keep null-safe */ }
  return { status: res.status, json, text };
}

function signWebhook(payload: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

async function postWebhook(payload: string, signature?: string) {
  return api('/api/v1/billing/webhook', {
    method: 'POST',
    rawBody: payload,
    headers: {
      'Content-Type': 'application/json',
      ...(signature ? { 'Stripe-Signature': signature } : {}),
    },
  });
}

const RUN = Date.now().toString(36);
const EVT = {
  checkout: `evt_it_checkout_${RUN}`,
  subUpdated: `evt_it_sub_${RUN}`,
  invoicePaid: `evt_it_invoice_${RUN}`,
  invoiceFailed: `evt_it_invoice_failed_${RUN}`,
  subDeleted: `evt_it_sub_deleted_${RUN}`,
  forgedUnsigned: `evt_it_forged_unsigned_${RUN}`,
  forgedTampered: `evt_it_forged_tampered_${RUN}`,
};
const SUB_ID = `sub_it_${RUN}`;
const INVOICE_PAID_ID = `in_it_${RUN}`;
const INVOICE_FAILED_ID = `in_it_failed_${RUN}`;

async function orgRow(orgId: string) {
  const r = await query(
    `SELECT plan, subscription_status AS "subscriptionStatus", stripe_customer_id AS "stripeCustomerId",
            stripe_subscription_id AS "stripeSubscriptionId", subscription_current_period_end AS "periodEnd"
     FROM organizations WHERE id = $1`,
    [orgId],
  );
  return r.rows[0];
}

async function walletBalance(orgId: string): Promise<number> {
  const r = await query(`SELECT balance FROM credit_wallets WHERE organization_id = $1`, [orgId]);
  return r.rows[0]?.balance ?? 0;
}

// ---------------------------------------------------------------
// Setup: a real user + organization through the real signup route
// ---------------------------------------------------------------

const email = `stripe-it-${Date.now()}@example.com`;
const signup = await api('/api/v1/auth/signup', {
  method: 'POST',
  body: { email, password: 'TestPassword123!', name: 'Stripe IT Owner' },
});
assert.strictEqual(signup.status, 201, `signup failed: ${signup.text}`);
const token: string = signup.json.data.token;
const orgId: string = signup.json.data.user.organizationId;
assert.ok(token && orgId, 'signup returns token + organizationId');
console.log('  ✓ real signup created the test organization');

// Plans endpoint is DB-backed now.
{
  const plans = await api('/api/v1/billing/plans');
  assert.strictEqual(plans.status, 200);
  assert.strictEqual(plans.json.data.length, 5, 'five seeded plans');
  const pro = plans.json.data.find((p: any) => p.id === 'PRO');
  assert.strictEqual(pro.monthlyCredits, 5000);
  assert.strictEqual(pro.priceMonthly, 79);
  console.log('  ✓ GET /billing/plans serves the plans table (PRO: $79/mo, 5000 monthly credits)');
}

// ---------------------------------------------------------------
// Checkout: env-fallback price, customer created once and reused
// ---------------------------------------------------------------

let CUSTOMER_ID = '';

{
  const checkout = await api('/api/v1/billing/checkout', {
    method: 'POST', token, body: { planId: 'PRO', interval: 'month' },
  });
  assert.strictEqual(checkout.status, 200, `checkout failed: ${checkout.text}`);
  assert.strictEqual(checkout.json.data.url, 'https://checkout.stripe.com/c/pay/cs_mock_1');
  assert.strictEqual(checkout.json.data.sessionId, 'cs_mock_1');

  CUSTOMER_ID = (await orgRow(orgId)).stripeCustomerId;
  assert.ok(CUSTOMER_ID, 'customer id persisted on the org');

  const customerCalls = stripeCalls.filter((c) => c.path === '/v1/customers');
  const sessionCalls = stripeCalls.filter((c) => c.path === '/v1/checkout/sessions');
  assert.strictEqual(customerCalls.length, 1, 'one Stripe customer created');
  assert.strictEqual(customerCalls[0].params.get('metadata[organizationId]'), orgId);
  assert.strictEqual(customerCalls[0].params.get('email'), email);
  assert.strictEqual(sessionCalls.length, 1);
  assert.strictEqual(sessionCalls[0].params.get('mode'), 'subscription');
  assert.strictEqual(sessionCalls[0].params.get('customer'), CUSTOMER_ID);
  assert.strictEqual(sessionCalls[0].params.get('line_items[0][price]'), 'price_pro_env_it', 'env price fallback used');
  assert.strictEqual(sessionCalls[0].params.get('metadata[planId]'), 'PRO');
  assert.strictEqual(sessionCalls[0].params.get('subscription_data[metadata][organizationId]'), orgId);
  assert.strictEqual(sessionCalls[0].params.get('success_url'), 'http://app.test/billing?checkout=success');

  console.log('  ✓ checkout created customer + subscription session with correct shape; customer persisted');
}

{
  const again = await api('/api/v1/billing/checkout', {
    method: 'POST', token, body: { planId: 'PRO', interval: 'month' },
  });
  assert.strictEqual(again.status, 200);
  assert.strictEqual(stripeCalls.filter((c) => c.path === '/v1/customers').length, 1, 'customer reused, not recreated');
  console.log('  ✓ second checkout reuses the stored Stripe customer');
}

// Plans-table price column beats the env fallback (end to end).
{
  await query(`UPDATE plans SET stripe_price_id_monthly = 'price_pro_column_it' WHERE id = 'PRO'`);
  const checkout = await api('/api/v1/billing/checkout', {
    method: 'POST', token, body: { planId: 'PRO', interval: 'month' },
  });
  assert.strictEqual(checkout.status, 200);
  const sessionCalls = stripeCalls.filter((c) => c.path === '/v1/checkout/sessions');
  const last = sessionCalls[sessionCalls.length - 1];
  assert.strictEqual(last.params.get('line_items[0][price]'), 'price_pro_column_it', 'plans column wins over env');
  await query(`UPDATE plans SET stripe_price_id_monthly = NULL WHERE id = 'PRO'`);
  console.log('  ✓ plans.stripe_price_id_monthly takes precedence over the env fallback');
}

// Portal session.
{
  const portal = await api('/api/v1/billing/portal', { method: 'POST', token, body: {} });
  assert.strictEqual(portal.status, 200, `portal failed: ${portal.text}`);
  assert.strictEqual(portal.json.data.url, 'https://billing.stripe.com/p/session/bps_mock_1');
  console.log('  ✓ customer portal session created for the stored customer');
}

// ---------------------------------------------------------------
// Webhook flow — locally signed fixtures through constructEvent
// ---------------------------------------------------------------

const PERIOD_END_1 = 1893456000; // 2030-01-01T00:00:00Z
const PERIOD_END_2 = 1896134400; // 2030-02-01T00:00:00Z

function evt(id: string, type: string, object: any): string {
  return JSON.stringify({ id, object: 'event', type, created: Math.floor(Date.now() / 1000), data: { object } });
}

// checkout.session.completed links plan + subscription.
{
  const payload = evt(EVT.checkout, 'checkout.session.completed', {
    id: 'cs_mock_1', object: 'checkout.session', mode: 'subscription',
    customer: CUSTOMER_ID, subscription: SUB_ID, client_reference_id: orgId,
    metadata: { organizationId: orgId, planId: 'PRO', interval: 'month' },
  });
  const res = await postWebhook(payload, signWebhook(payload));
  assert.strictEqual(res.status, 200, `webhook checkout failed: ${res.text}`);
  const org = await orgRow(orgId);
  assert.strictEqual(org.plan, 'PRO');
  assert.strictEqual(org.subscriptionStatus, 'active');
  assert.strictEqual(org.stripeSubscriptionId, SUB_ID);
  const stored = await query(`SELECT processed FROM stripe_events WHERE event_id = '${EVT.checkout}'`);
  assert.strictEqual(stored.rows[0].processed, true);
  console.log('  ✓ signed checkout.session.completed applied (plan PRO, subscription linked, event processed)');
}

// subscription.updated stores the renewal date.
{
  const payload = evt(EVT.subUpdated, 'customer.subscription.updated', {
    id: SUB_ID, object: 'subscription', customer: CUSTOMER_ID, status: 'active',
    current_period_start: PERIOD_END_1 - 2592000, current_period_end: PERIOD_END_1,
    metadata: { organizationId: orgId, planId: 'PRO' },
    items: { data: [{ price: { id: 'price_pro_env_it' } }] },
  });
  const res = await postWebhook(payload, signWebhook(payload));
  assert.strictEqual(res.status, 200, `webhook subscription.updated failed: ${res.text}`);
  const org = await orgRow(orgId);
  assert.strictEqual(new Date(org.periodEnd).getTime(), PERIOD_END_1 * 1000, 'renewal date stored');

  const sub = await api('/api/v1/billing/subscription', { token });
  assert.strictEqual(sub.json.data.plan, 'PRO');
  assert.strictEqual(sub.json.data.status, 'active');
  assert.ok(String(sub.json.data.renewalDate).startsWith('2030-01-01'), 'subscription endpoint serves the renewal date');
  assert.strictEqual(sub.json.data.hasStripeCustomer, true);
  console.log('  ✓ subscription.updated stored period end; /billing/subscription serves it from the DB');
}

// invoice.payment_succeeded grants the monthly allotment exactly once.
const balanceBefore = await walletBalance(orgId);
{
  const payload = evt(EVT.invoicePaid, 'invoice.payment_succeeded', {
    id: INVOICE_PAID_ID, object: 'invoice', customer: CUSTOMER_ID, subscription: SUB_ID,
    amount_paid: 7900, amount_due: 0, currency: 'usd', status: 'paid',
    period_start: PERIOD_END_1, period_end: PERIOD_END_2,
    invoice_pdf: `https://pay.stripe.com/invoice/${INVOICE_PAID_ID}/pdf`,
    status_transitions: { paid_at: PERIOD_END_1 },
    lines: { data: [{ price: { id: 'price_pro_env_it', recurring: { interval: 'month' } } }] },
  });
  const res = await postWebhook(payload, signWebhook(payload));
  assert.strictEqual(res.status, 200, `webhook invoice paid failed: ${res.text}`);

  const balanceAfter = await walletBalance(orgId);
  assert.strictEqual(balanceAfter - balanceBefore, 5000, `expected +5000 PRO allotment, got ${balanceAfter - balanceBefore}`);

  const invoice = await query(`SELECT status, amount_cents FROM invoices WHERE stripe_invoice_id = '${INVOICE_PAID_ID}'`);
  assert.strictEqual(invoice.rows[0].status, 'paid');
  assert.strictEqual(invoice.rows[0].amount_cents, 7900);

  const grants = await query(`SELECT COUNT(*)::int AS n FROM credit_transactions WHERE idempotency_key = 'stripe_invoice_${INVOICE_PAID_ID}'`);
  assert.strictEqual(grants.rows[0].n, 1, 'exactly one grant transaction');

  const org = await orgRow(orgId);
  assert.strictEqual(new Date(org.periodEnd).getTime(), PERIOD_END_2 * 1000, 'period end advanced from the invoice');
  console.log('  ✓ invoice.payment_succeeded: invoice recorded, +5000 credits granted once');
}

// Replay of the SAME event: acked as duplicate, no double grant.
{
  const payload = evt(EVT.invoicePaid, 'invoice.payment_succeeded', {
    id: INVOICE_PAID_ID, object: 'invoice', customer: CUSTOMER_ID, subscription: SUB_ID,
    amount_paid: 7900, amount_due: 0, currency: 'usd', status: 'paid',
    period_start: PERIOD_END_1, period_end: PERIOD_END_2,
    invoice_pdf: `https://pay.stripe.com/invoice/${INVOICE_PAID_ID}/pdf`,
    status_transitions: { paid_at: PERIOD_END_1 },
    lines: { data: [{ price: { id: 'price_pro_env_it', recurring: { interval: 'month' } } }] },
  });
  const res = await postWebhook(payload, signWebhook(payload));
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.data.duplicate, true, 'replay recognized as duplicate');
  assert.strictEqual(await walletBalance(orgId), balanceBefore + 5000, 'no double grant on replay');
  console.log('  ✓ replayed event acked as duplicate — credits NOT granted twice');
}

// invoice.payment_failed marks past_due.
{
  const payload = evt(EVT.invoiceFailed, 'invoice.payment_failed', {
    id: INVOICE_FAILED_ID, object: 'invoice', customer: CUSTOMER_ID, subscription: SUB_ID,
    amount_paid: 0, amount_due: 7900, currency: 'usd', status: 'open', attempt_count: 1,
    lines: { data: [{ price: { id: 'price_pro_env_it', recurring: { interval: 'month' } } }] },
  });
  const res = await postWebhook(payload, signWebhook(payload));
  assert.strictEqual(res.status, 200);
  const org = await orgRow(orgId);
  assert.strictEqual(org.subscriptionStatus, 'past_due');
  const invoice = await query(`SELECT status FROM invoices WHERE stripe_invoice_id = '${INVOICE_FAILED_ID}'`);
  assert.strictEqual(invoice.rows[0].status, 'open');
  console.log('  ✓ invoice.payment_failed: status past_due, invoice recorded open');
}

// subscription.deleted downgrades to FREE / canceled.
{
  const payload = evt(EVT.subDeleted, 'customer.subscription.deleted', {
    id: SUB_ID, object: 'subscription', customer: CUSTOMER_ID, status: 'canceled',
    metadata: { organizationId: orgId, planId: 'PRO' },
    items: { data: [{ price: { id: 'price_pro_env_it' } }] },
  });
  const res = await postWebhook(payload, signWebhook(payload));
  assert.strictEqual(res.status, 200);
  const org = await orgRow(orgId);
  assert.strictEqual(org.plan, 'FREE');
  assert.strictEqual(org.subscriptionStatus, 'canceled');
  assert.strictEqual(org.periodEnd, null);
  console.log('  ✓ subscription.deleted: plan FREE, status canceled, renewal cleared');
}

// ---------------------------------------------------------------
// Forged deliveries: 400 and ZERO state change
// ---------------------------------------------------------------

{
  const orgBefore = await orgRow(orgId);
  const balanceNow = await walletBalance(orgId);

  // No signature header at all.
  const forged = evt(EVT.forgedUnsigned, 'invoice.payment_succeeded', {
    id: 'in_forged', object: 'invoice', customer: CUSTOMER_ID, subscription: SUB_ID,
    amount_paid: 99999900, currency: 'usd',
    lines: { data: [{ price: { recurring: { interval: 'month' } } }] },
  });
  const unsigned = await postWebhook(forged);
  assert.strictEqual(unsigned.status, 400, `unsigned delivery must be 400, got ${unsigned.status}`);

  // Signed, then tampered (amount inflated after signing).
  const signedPayload = evt(EVT.forgedTampered, 'invoice.payment_succeeded', {
    id: 'in_forged_2', object: 'invoice', customer: CUSTOMER_ID, subscription: SUB_ID,
    amount_paid: 100, currency: 'usd',
    lines: { data: [{ price: { recurring: { interval: 'month' } } }] },
  });
  const signature = signWebhook(signedPayload);
  const tampered = signedPayload.replace('"amount_paid":100', '"amount_paid":99999900');
  const tamperedRes = await postWebhook(tampered, signature);
  assert.strictEqual(tamperedRes.status, 400, `tampered delivery must be 400, got ${tamperedRes.status}`);

  const stored = await query(`SELECT COUNT(*)::int AS n FROM stripe_events WHERE event_id IN ('${EVT.forgedUnsigned}', '${EVT.forgedTampered}')`);
  assert.strictEqual(stored.rows[0].n, 0, 'forged events are never recorded');
  assert.deepStrictEqual(await orgRow(orgId), orgBefore, 'org state untouched by forged deliveries');
  assert.strictEqual(await walletBalance(orgId), balanceNow, 'no credits from forged deliveries');
  console.log('  ✓ unsigned + tampered deliveries rejected 400 with zero state change');
}

server.close();
mockStripe.close();
await closePool();
await pool.end();

console.log('✅ Stripe billing integration tests passed');
