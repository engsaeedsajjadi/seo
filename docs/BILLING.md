# RankForge — Billing Documentation

## Plans

Configurable plans stored centrally in `packages/billing/src/index.ts`:

| Plan | Monthly | Annual | Projects | Keywords | Pages | Rank Checks | AI Ops | Reports | Users | API Req |
|------|---------|--------|----------|----------|-------|-------------|--------|---------|-------|---------|
| FREE | $0 | $0 | 1 | 10 | 100 | 100 | 10 | 5 | 1 | 100 |
| STARTER | $29 | $290 | 3 | 100 | 1k | 1k | 100 | 20 | 2 | 1k |
| PRO | $79 | $790 | 10 | 500 | 10k | 5k | 500 | 100 | 5 | 5k |
| AGENCY | $199 | $1990 | 50 | 2500 | 50k | 25k | 2500 | 500 | 20 | 25k |
| ENTERPRISE | $499 | $4990 | 200 | 10k | 200k | 100k | 10k | 2k | 100 | 100k |

Limits include: competitors, backlinks, crawl depth, history months.

Do not hardcode limits throughout app — use `getPlan(tier)` and `canPerformAction()`.

## Stripe Integration

### Entities
- Subscription, Plan, Price, Invoice, Payment, Coupon, CreditGrant, UsageRecord

### Flow
1. User selects plan → POST /billing/checkout {planId, annual}
2. Backend creates Stripe Checkout Session (if STRIPE_SECRET_KEY configured)
3. User completes payment on Stripe
4. Stripe webhook → /webhooks/stripe (signature verified)
5. Webhook handler updates organization plan, creates invoice, grants credits
6. If payment fails → grace period, notify, downgrade after period

### Webhook Verification
Never trust payload without signature:
```ts
stripe.webhooks.constructEvent(payload, signature, webhookSecret)
```

### Supported Events
- checkout.session.completed
- customer.subscription.updated
- customer.subscription.deleted
- invoice.paid
- invoice.payment_failed

## Credit System

### Entities
- CreditWallet: id, organizationId (unique), balance, total_granted, total_consumed
- CreditTransaction: id, orgId, type (grant, consumption, refund, expiry), amount, balance_after, description, reference_type, reference_id
- UsageRecord: metric, quantity, provider, cost_cents, period

### Operations
Every paid operation records:
- organization, project, operation, provider, quantity, cost, timestamp

Costs:
- crawl_page: 1 credit
- serp_call: 2
- keyword_call: 1
- backlink_call: 2
- ai_request: 5
- ai_token_1k: 1
- report_generation: 3
- pagespeed_check: 1

### Auditable
All transactions stored, never deleted. Balance = sum(grants) - sum(consumptions) + sum(refunds).

## Usage Metering

Track:
- crawl_pages, serp_calls, keyword_calls, backlink_calls, ai_tokens, ai_requests, reports, api_calls, pagespeed_checks

Dashboard shows usage vs limits, warns before limits reached.

## Free Trial

- New orgs get 100 free credits
- Trial period configurable (e.g., 14 days for paid plans)
- Trial ends → downgrade to FREE if not subscribed

## Upgrades/Downgrades

- Upgrade immediate, proration via Stripe
- Downgrade at period end
- Cancellation → cancel_at_period_end, retains access until end

## Invoices

- Stored in invoices table
- Stripe invoice ID, amount, currency, status, period, pdf_url
- Legal retention: 7 years (configurable)

## Not Configured State

If STRIPE_SECRET_KEY not set:
- Billing endpoints return `PROVIDER_NOT_CONFIGURED`
- UI shows "Stripe not configured" — never fake subscription
- Free plan still works (in-memory)
