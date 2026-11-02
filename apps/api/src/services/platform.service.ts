import { query, runAsSystem, transaction } from '../db/client.js';

/** Operator allow-list from the environment, so no customer action can grant platform access. */
export function isPlatformAdmin(email?: string): boolean {
  if (!email) return false;
  const admins = (process.env.PLATFORM_ADMIN_EMAILS || '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.toLowerCase());
}

export const platformService = {
  overview() {
    return runAsSystem(async () => {
      const totals = await query(`SELECT
        (SELECT COUNT(*)::int FROM organizations WHERE deleted_at IS NULL) AS organizations,
        (SELECT COUNT(*)::int FROM organizations WHERE suspended_at IS NOT NULL AND deleted_at IS NULL) AS suspended,
        (SELECT COUNT(*)::int FROM users WHERE deleted_at IS NULL) AS users,
        (SELECT COUNT(*)::int FROM users WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '30 days') AS new_users_30d,
        (SELECT COUNT(*)::int FROM projects WHERE deleted_at IS NULL) AS projects,
        (SELECT COALESCE(SUM(amount_cents), 0)::bigint FROM invoices WHERE status = 'paid') AS revenue_cents_total,
        (SELECT COALESCE(SUM(amount_cents), 0)::bigint FROM invoices WHERE status = 'paid' AND paid_at >= date_trunc('month', NOW())) AS revenue_cents_month,
        (SELECT COALESCE(SUM(-amount), 0)::bigint FROM credit_transactions WHERE type = 'consumption' AND created_at >= date_trunc('month', NOW())) AS credits_consumed_month,
        (SELECT COALESCE(SUM(estimated_cost_usd), 0)::float FROM ai_usage WHERE created_at >= date_trunc('month', NOW())) AS ai_cost_usd_month`);
      const plans = await query(`SELECT o.plan, COUNT(*)::int AS organizations, COALESCE(p.price_monthly_cents, 0)::int AS price_monthly_cents
        FROM organizations o LEFT JOIN plans p ON p.id = o.plan WHERE o.deleted_at IS NULL GROUP BY o.plan, p.price_monthly_cents ORDER BY price_monthly_cents`);
      const jobs = await query(`SELECT status, COUNT(*)::int AS count FROM jobs WHERE created_at >= NOW() - INTERVAL '24 hours' GROUP BY status`);
      return {
        ...totals.rows[0],
        plans: plans.rows,
        jobsLast24h: Object.fromEntries(jobs.rows.map((r: any) => [r.status, r.count])),
      };
    });
  },

  listOrganizations(search: string, limit: number, offset: number) {
    return runAsSystem(async () => {
      const result = await query(`SELECT o.id, o.name, o.plan, o.subscription_status AS "subscriptionStatus", o.suspended_at AS "suspendedAt", o.created_at AS "createdAt",
          u.email AS "ownerEmail", COALESCE(w.balance, 0) AS balance,
          (SELECT COUNT(*)::int FROM organization_members m WHERE m.organization_id = o.id) AS members,
          (SELECT COUNT(*)::int FROM projects p WHERE p.organization_id = o.id AND p.deleted_at IS NULL) AS projects,
          (SELECT COALESCE(SUM(amount_cents), 0)::bigint FROM invoices i WHERE i.organization_id = o.id AND i.status = 'paid') AS "revenueCents"
        FROM organizations o
        JOIN users u ON u.id = o.owner_id
        LEFT JOIN credit_wallets w ON w.organization_id = o.id
        WHERE o.deleted_at IS NULL AND ($1 = '' OR o.name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')
        ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`, [search, limit, offset]);
      return result.rows;
    });
  },

  update(organizationId: string, actorId: string, changes: { plan?: string; suspended?: boolean }) {
    return runAsSystem(() => transaction(async () => {
      const updated = await query(`UPDATE organizations SET
          plan = COALESCE($2, plan),
          suspended_at = CASE WHEN $3::boolean IS NULL THEN suspended_at WHEN $3::boolean THEN NOW() ELSE NULL END,
          updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL RETURNING id, plan, suspended_at AS "suspendedAt"`, [organizationId, changes.plan ?? null, changes.suspended ?? null]);
      if (!updated.rows[0]) throw { status: 404, code: 'NOT_FOUND', message: 'Organization not found' };
      await query(`INSERT INTO audit_logs (organization_id, user_id, action, resource_type, resource_id, details) VALUES ($1, $2, 'platform.organization_update', 'organization', $1, $3)`,
        [organizationId, actorId, JSON.stringify(changes)]);
      return updated.rows[0];
    }));
  },

  grantCredits(organizationId: string, actorId: string, amount: number, reason: string, requestId: string) {
    return runAsSystem(() => transaction(async () => {
      const key = `platform_grant_${organizationId}_${requestId}`;
      const wallet = await query('SELECT balance FROM credit_wallets WHERE organization_id = $1 FOR UPDATE', [organizationId]);
      if (!wallet.rows[0]) throw { status: 404, code: 'NOT_FOUND', message: 'Wallet not found' };
      const existing = await query('SELECT balance_after FROM credit_transactions WHERE idempotency_key = $1', [key]);
      if (existing.rows[0]) return { balance: existing.rows[0].balance_after, duplicate: true };
      const updated = await query(`UPDATE credit_wallets SET balance = balance + $2, total_granted = total_granted + $2, updated_at = NOW() WHERE organization_id = $1 RETURNING balance`, [organizationId, amount]);
      await query(`INSERT INTO credit_transactions (organization_id, type, amount, balance_after, description, reference_type, idempotency_key) VALUES ($1, 'grant', $2, $3, $4, 'platform', $5)`,
        [organizationId, amount, updated.rows[0].balance, reason, key]);
      await query(`INSERT INTO audit_logs (organization_id, user_id, action, resource_type, resource_id, details) VALUES ($1, $2, 'platform.credit_grant', 'organization', $1, $3)`,
        [organizationId, actorId, JSON.stringify({ amount, reason })]);
      return { balance: updated.rows[0].balance, duplicate: false };
    }));
  },
};
