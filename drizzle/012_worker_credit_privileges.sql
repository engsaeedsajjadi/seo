-- RankForge 012: tenant-scoped Worker credit privileges.

GRANT SELECT ON public.credit_wallets
TO rankforge_worker;

GRANT UPDATE (
  balance, total_consumed, updated_at
) ON public.credit_wallets
TO rankforge_worker;

GRANT SELECT (
  id, organization_id, type,
  reference_type, reference_id, idempotency_key
) ON public.credit_transactions
TO rankforge_worker;

GRANT INSERT (
  organization_id, type, amount,
  balance_after, description,
  reference_type, reference_id, idempotency_key
) ON public.credit_transactions
TO rankforge_worker;

-- Restrictive guards remain effective even if another
-- permissive policy is introduced later.

DROP POLICY IF EXISTS worker_credit_wallet_guard
ON public.credit_wallets;

CREATE POLICY worker_credit_wallet_guard
ON public.credit_wallets
AS RESTRICTIVE FOR ALL TO rankforge_worker
USING (
  organization_id =
    NULLIF(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  organization_id =
    NULLIF(current_setting('app.current_organization_id', true), '')::uuid
);

DROP POLICY IF EXISTS worker_credit_transaction_guard
ON public.credit_transactions;

CREATE POLICY worker_credit_transaction_guard
ON public.credit_transactions
AS RESTRICTIVE FOR ALL TO rankforge_worker
USING (
  organization_id =
    NULLIF(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  organization_id =
    NULLIF(current_setting('app.current_organization_id', true), '')::uuid
);