-- Migration 018: prepaid subscriptions in toman through Zarinpal.
-- Iranian gateways do not charge a saved card, so a subscription is a paid period that
-- ends on a date. Renewing is another payment; an unpaid plan falls back to FREE.

ALTER TABLE plans ADD COLUMN IF NOT EXISTS price_monthly_toman BIGINT NOT NULL DEFAULT 0 CHECK (price_monthly_toman >= 0);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS price_annual_toman BIGINT NOT NULL DEFAULT 0 CHECK (price_annual_toman >= 0);

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS renewal_reminder_sent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  gateway TEXT NOT NULL DEFAULT 'zarinpal',
  plan_id VARCHAR(20) NOT NULL REFERENCES plans(id),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('month', 'year')),
  amount_toman BIGINT NOT NULL CHECK (amount_toman > 0),
  list_price_toman BIGINT NOT NULL CHECK (list_price_toman > 0),
  authority TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'creating' CHECK (status IN ('creating', 'pending', 'paid', 'failed')),
  ref_id TEXT,
  card_pan TEXT,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payments_org ON payments (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_open ON payments (created_at) WHERE status = 'pending';

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON payments;
CREATE POLICY tenant_isolation ON payments FOR ALL
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- Customers read their history. Only the system role, after gateway verification, can settle.
GRANT SELECT ON payments TO rankforge_api;
GRANT SELECT, INSERT, UPDATE ON payments TO rankforge_api_system;
