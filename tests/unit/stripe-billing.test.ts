/**
 * RankForge — Stripe Billing (phase 5): unit tests
 *
 * Focus: the parts that must be exactly right before real money moves.
 *   - Webhook signature verification through the REAL SDK
 *     constructEvent, with signatures computed locally (HMAC-SHA256
 *     over `${timestamp}.${payload}`) — valid, tampered, wrong-secret,
 *     and stale-timestamp cases.
 *   - Stripe form encoding (bracket notation) for API requests.
 *   - Plan → price resolution precedence (plans-table column > env).
 *   - Credit grant math (monthly allotment, ×12 for annual invoices).
 *   - StripeClient request shapes against a recording mock fetch,
 *     provider-error surfacing, and the not-configured gate (which
 *     must fire before any HTTP call).
 */

import assert from 'assert';
import crypto from 'crypto';

console.log('Testing Stripe billing units...');

const {
  StripeClient,
  StripeApiError,
  verifyStripeWebhookEvent,
  resolveStripePriceId,
  mapSubscriptionStatus,
  invoiceBillingInterval,
  creditsForPaidInvoice,
  planIdForPriceId,
  toFormBody,
} = await import('../../apps/api/src/lib/stripe.js');

// ---------------------------------------------------------------
// 1. Webhook signature verification (locally signed payloads)
// ---------------------------------------------------------------

const WEBHOOK_SECRET = 'whsec_unit_test_secret';
const API_SECRET = 'sk_test_unit';

function signPayload(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const v1 = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

const eventFixture = JSON.stringify({
  id: 'evt_unit_1',
  object: 'event',
  type: 'invoice.payment_succeeded',
  data: { object: { id: 'in_unit_1', object: 'invoice', customer: 'cus_unit_1', amount_paid: 7900 } },
});

// Valid signature → event parsed.
{
  const event = verifyStripeWebhookEvent(eventFixture, signPayload(eventFixture, WEBHOOK_SECRET), WEBHOOK_SECRET, API_SECRET);
  assert.strictEqual(event.id, 'evt_unit_1');
  assert.strictEqual(event.type, 'invoice.payment_succeeded');
  console.log('  ✓ valid locally-signed payload verifies via constructEvent');
}

// Valid signature over a Buffer body (the route passes raw bytes).
{
  const raw = Buffer.from(eventFixture, 'utf8');
  const event = verifyStripeWebhookEvent(raw, signPayload(eventFixture, WEBHOOK_SECRET), WEBHOOK_SECRET, API_SECRET);
  assert.strictEqual(event.id, 'evt_unit_1');
  console.log('  ✓ raw Buffer body verifies');
}

// Tampered payload (amount changed after signing) → rejected.
{
  const header = signPayload(eventFixture, WEBHOOK_SECRET);
  const tampered = eventFixture.replace('7900', '10');
  assert.throws(
    () => verifyStripeWebhookEvent(tampered, header, WEBHOOK_SECRET, API_SECRET),
    (e: any) => e instanceof StripeApiError && e.httpStatus === 400,
  );
  console.log('  ✓ tampered payload rejected');
}

// Wrong secret → rejected.
{
  const header = signPayload(eventFixture, 'whsec_some_other_secret');
  assert.throws(() => verifyStripeWebhookEvent(eventFixture, header, WEBHOOK_SECRET, API_SECRET), StripeApiError);
  console.log('  ✓ wrong-secret signature rejected');
}

// Stale timestamp (correctly signed but an hour old) → rejected by tolerance.
{
  const stale = Math.floor(Date.now() / 1000) - 3600;
  const header = signPayload(eventFixture, WEBHOOK_SECRET, stale);
  assert.throws(() => verifyStripeWebhookEvent(eventFixture, header, WEBHOOK_SECRET, API_SECRET), StripeApiError);
  console.log('  ✓ stale timestamp rejected (replay window)');
}

// Garbage header → rejected.
{
  assert.throws(() => verifyStripeWebhookEvent(eventFixture, 'not-a-signature', WEBHOOK_SECRET, API_SECRET), StripeApiError);
  console.log('  ✓ garbage signature header rejected');
}

// ---------------------------------------------------------------
// 2. Form encoding (Stripe bracket notation)
// ---------------------------------------------------------------

{
  const body = toFormBody({
    mode: 'subscription',
    customer: 'cus_123',
    line_items: [{ price: 'price_123', quantity: 1 }],
    metadata: { organizationId: 'org_1', planId: 'PRO' },
    subscription_data: { metadata: { planId: 'PRO' } },
  });
  const params = new URLSearchParams(body);
  assert.strictEqual(params.get('mode'), 'subscription');
  assert.strictEqual(params.get('line_items[0][price]'), 'price_123');
  assert.strictEqual(params.get('line_items[0][quantity]'), '1');
  assert.strictEqual(params.get('metadata[organizationId]'), 'org_1');
  assert.strictEqual(params.get('subscription_data[metadata][planId]'), 'PRO');
  console.log('  ✓ form encoding produces Stripe bracket notation');
}

// ---------------------------------------------------------------
// 3. Price resolution precedence
// ---------------------------------------------------------------

{
  const plan = { id: 'PRO', stripePriceIdMonthly: 'price_from_column', stripePriceIdAnnual: null };
  const env = { STRIPE_PRICE_PRO_MONTHLY: 'price_from_env', STRIPE_PRICE_PRO_ANNUAL: 'price_env_annual' };
  assert.strictEqual(resolveStripePriceId(plan, 'month', env), 'price_from_column', 'column wins over env');
  assert.strictEqual(resolveStripePriceId(plan, 'year', env), 'price_env_annual', 'env fallback when column null');
  assert.strictEqual(resolveStripePriceId({ id: 'PRO' }, 'month', {}), null, 'null when neither set');
  assert.strictEqual(resolveStripePriceId({ id: 'AGENCY', stripePriceIdAnnual: 'price_ag_y' }, 'year', {}), 'price_ag_y');
  console.log('  ✓ price resolution: column > env > null');
}

// ---------------------------------------------------------------
// 4. Event math helpers
// ---------------------------------------------------------------

{
  assert.strictEqual(mapSubscriptionStatus('active'), 'active');
  assert.strictEqual(mapSubscriptionStatus('past_due'), 'past_due');
  assert.strictEqual(mapSubscriptionStatus('trialing'), 'trialing');
  assert.strictEqual(mapSubscriptionStatus('something_new'), 'incomplete');
  assert.strictEqual(mapSubscriptionStatus(undefined), 'incomplete');

  assert.strictEqual(invoiceBillingInterval({ lines: { data: [{ price: { recurring: { interval: 'month' } } }] } }), 'month');
  assert.strictEqual(invoiceBillingInterval({ lines: { data: [{ price: { recurring: { interval: 'year' } } }] } }), 'year');
  assert.strictEqual(invoiceBillingInterval({ lines: { data: [] } }), null);
  assert.strictEqual(invoiceBillingInterval({}), null);

  assert.strictEqual(creditsForPaidInvoice(5000, 'month'), 5000);
  assert.strictEqual(creditsForPaidInvoice(5000, 'year'), 60000);
  assert.strictEqual(creditsForPaidInvoice(5000, null), 5000);
  assert.strictEqual(creditsForPaidInvoice(0, 'month'), 0);

  const plans = [
    { id: 'PRO', stripePriceIdMonthly: 'price_pro_m', stripePriceIdAnnual: 'price_pro_y' },
    { id: 'STARTER', stripePriceIdMonthly: 'price_st_m', stripePriceIdAnnual: null },
  ];
  assert.strictEqual(planIdForPriceId('price_pro_y', plans), 'PRO');
  assert.strictEqual(planIdForPriceId('price_st_m', plans), 'STARTER');
  assert.strictEqual(planIdForPriceId('price_unknown', plans), null);
  assert.strictEqual(planIdForPriceId(null, plans), null);
  console.log('  ✓ status mapping, invoice interval, grant math, price→plan lookup');
}

// ---------------------------------------------------------------
// 5. StripeClient request shapes (recording mock fetch)
// ---------------------------------------------------------------

function recordingFetch(responder: (url: string, init: any) => any) {
  const calls: { url: string; init: any }[] = [];
  const fetchFn = async (url: string, init: any) => {
    calls.push({ url, init });
    const body = responder(url, init);
    return { status: 200, ok: true, json: async () => body };
  };
  return { calls, fetchFn };
}

{
  const { calls, fetchFn } = recordingFetch((url) => {
    if (url.endsWith('/v1/customers')) return { id: 'cus_new_1' };
    if (url.endsWith('/v1/checkout/sessions')) return { id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' };
    if (url.endsWith('/v1/billing_portal/sessions')) return { id: 'bps_1', url: 'https://billing.stripe.com/p/session/bps_1' };
    throw new Error(`unexpected URL ${url}`);
  });
  const client = new StripeClient({ secretKey: 'sk_test_client', apiBase: 'https://stripe.test', fetchFn });

  const customer = await client.createCustomer({ email: 'owner@example.com', name: 'Acme', organizationId: 'org_42' });
  assert.strictEqual(customer.id, 'cus_new_1');
  const customerBody = new URLSearchParams(calls[0].init.body);
  assert.strictEqual(calls[0].url, 'https://stripe.test/v1/customers');
  assert.strictEqual(calls[0].init.headers.Authorization, 'Bearer sk_test_client');
  assert.strictEqual(calls[0].init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.strictEqual(customerBody.get('email'), 'owner@example.com');
  assert.strictEqual(customerBody.get('metadata[organizationId]'), 'org_42');

  const session = await client.createCheckoutSession({
    customerId: 'cus_new_1',
    priceId: 'price_pro_m',
    organizationId: 'org_42',
    planId: 'PRO',
    interval: 'month',
    successUrl: 'https://app.example/billing?checkout=success',
    cancelUrl: 'https://app.example/billing?checkout=cancelled',
  });
  assert.strictEqual(session.url, 'https://checkout.stripe.com/c/pay/cs_1');
  const sessionBody = new URLSearchParams(calls[1].init.body);
  assert.strictEqual(sessionBody.get('mode'), 'subscription');
  assert.strictEqual(sessionBody.get('customer'), 'cus_new_1');
  assert.strictEqual(sessionBody.get('client_reference_id'), 'org_42');
  assert.strictEqual(sessionBody.get('line_items[0][price]'), 'price_pro_m');
  assert.strictEqual(sessionBody.get('line_items[0][quantity]'), '1');
  assert.strictEqual(sessionBody.get('metadata[organizationId]'), 'org_42');
  assert.strictEqual(sessionBody.get('metadata[planId]'), 'PRO');
  assert.strictEqual(sessionBody.get('subscription_data[metadata][organizationId]'), 'org_42');
  assert.strictEqual(sessionBody.get('subscription_data[metadata][planId]'), 'PRO');
  assert.strictEqual(sessionBody.get('success_url'), 'https://app.example/billing?checkout=success');

  const portal = await client.createPortalSession({ customerId: 'cus_new_1', returnUrl: 'https://app.example/billing' });
  assert.strictEqual(portal.url, 'https://billing.stripe.com/p/session/bps_1');
  const portalBody = new URLSearchParams(calls[2].init.body);
  assert.strictEqual(portalBody.get('customer'), 'cus_new_1');
  assert.strictEqual(portalBody.get('return_url'), 'https://app.example/billing');
  console.log('  ✓ customer / checkout session / portal session request shapes');
}

// Provider error surfaces verbatim; unconfigured client never calls out.
{
  const failingFetch = async () => ({
    status: 402,
    ok: false,
    json: async () => ({ error: { message: 'Your card was declined.', code: 'card_declined' } }),
  });
  const client = new StripeClient({ secretKey: 'sk_test_client', apiBase: 'https://stripe.test', fetchFn: failingFetch });
  await assert.rejects(
    () => client.createCustomer({ organizationId: 'org_1' }),
    (e: any) => e instanceof StripeApiError && e.message.includes('Your card was declined.') && e.providerCode === 'card_declined',
  );

  let fetchCalled = false;
  const unconfigured = new StripeClient({
    secretKey: '',
    apiBase: 'https://stripe.test',
    fetchFn: async () => { fetchCalled = true; throw new Error('must not be called'); },
  });
  assert.strictEqual(unconfigured.isConfigured(), false);
  await assert.rejects(
    () => unconfigured.createCustomer({ organizationId: 'org_1' }),
    (e: any) => e instanceof StripeApiError && e.providerCode === 'PROVIDER_NOT_CONFIGURED',
  );
  assert.strictEqual(fetchCalled, false, 'no HTTP call when unconfigured');
  console.log('  ✓ provider errors surface; unconfigured client refuses before any HTTP');
}

console.log('✅ Stripe billing unit tests passed');
