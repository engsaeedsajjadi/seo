/**
 * RankForge — Credit Repository — Atomic with Idempotency
 * Transaction-based ledger with FOR UPDATE, idempotency_key, balance checks
 * Prevents double-spending, negative balances, duplicate transactions
 */

import { query, transaction } from '../db/client.js';

export const creditRepository = {
  async getWallet(organizationId: string): Promise<any> {
    const result = await query(
      `SELECT id, organization_id as "organizationId", balance, total_granted as "totalGranted", total_consumed as "totalConsumed", updated_at as "updatedAt"
       FROM credit_wallets WHERE organization_id = $1`,
      [organizationId]
    );
    return result.rows[0] || null;
  },

  async createWallet(organizationId: string, initialBalance: number = 100): Promise<any> {
    const result = await query(
      `INSERT INTO credit_wallets (organization_id, balance, total_granted, total_consumed)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (organization_id) DO NOTHING
       RETURNING id, organization_id as "organizationId", balance, total_granted as "totalGranted", total_consumed as "totalConsumed"`,
      [organizationId, initialBalance, initialBalance]
    );
    if (result.rows[0]) return result.rows[0];
    return this.getWallet(organizationId);
  },

  async consumeCredits(organizationId: string, amount: number, description: string, referenceType?: string, referenceId?: string, idempotencyKey?: string): Promise<{ success: boolean; wallet?: any; error?: string; code?: string }> {
    if (amount <= 0) {
      return { success: false, error: 'Amount must be positive', code: 'VALIDATION_ERROR' };
    }

    const idemKey = idempotencyKey || `consume_${organizationId}_${referenceType || 'unknown'}_${referenceId || Date.now()}_${amount}`;

    return transaction(async (client) => {
      // Check idempotency first — if already processed, return existing wallet
      const existing = await client.query(
        'SELECT id, balance_after FROM credit_transactions WHERE idempotency_key = $1',
        [idemKey]
      );
      if (existing.rows.length > 0) {
        const wallet = await client.query(
          'SELECT id, organization_id as "organizationId", balance, total_granted as "totalGranted", total_consumed as "totalConsumed" FROM credit_wallets WHERE organization_id = $1',
          [organizationId]
        );
        return { success: true, wallet: wallet.rows[0] };
      }

      // Lock wallet row FOR UPDATE — prevents concurrent double-spending
      const walletResult = await client.query(
        'SELECT id, balance FROM credit_wallets WHERE organization_id = $1 FOR UPDATE',
        [organizationId]
      );

      if (walletResult.rows.length === 0) {
        return { success: false, error: 'Wallet not found', code: 'NOT_FOUND' };
      }

      const wallet = walletResult.rows[0];
      if (wallet.balance < amount) {
        return { success: false, error: `Insufficient credits: need ${amount}, have ${wallet.balance}`, code: 'INSUFFICIENT_CREDITS' };
      }

      const newBalance = wallet.balance - amount;

      // Ensure no negative balance (CHECK constraint also prevents)
      if (newBalance < 0) {
        return { success: false, error: 'Insufficient credits — would become negative', code: 'INSUFFICIENT_CREDITS' };
      }

      await client.query(
        'UPDATE credit_wallets SET balance = $1, total_consumed = total_consumed + $2, updated_at = NOW() WHERE organization_id = $3',
        [newBalance, amount, organizationId]
      );

      await client.query(
        `INSERT INTO credit_transactions (organization_id, type, amount, balance_after, description, reference_type, reference_id, idempotency_key)
         VALUES ($1, 'consumption', $2, $3, $4, $5, $6, $7)`,
        [organizationId, -amount, newBalance, description, referenceType || null, referenceId || null, idemKey]
      );

      const updatedWallet = await client.query(
        'SELECT id, organization_id as "organizationId", balance, total_granted as "totalGranted", total_consumed as "totalConsumed" FROM credit_wallets WHERE organization_id = $1',
        [organizationId]
      );

      return { success: true, wallet: updatedWallet.rows[0] };
    });
  },

  async grantCredits(organizationId: string, amount: number, description: string, referenceType?: string, referenceId?: string, idempotencyKey?: string): Promise<any> {
    if (amount <= 0) throw new Error('Amount must be positive');

    const idemKey = idempotencyKey || `grant_${organizationId}_${referenceType || 'unknown'}_${referenceId || Date.now()}_${amount}`;

    return transaction(async (client) => {
      // Idempotency check
      const existing = await client.query(
        'SELECT id FROM credit_transactions WHERE idempotency_key = $1',
        [idemKey]
      );
      if (existing.rows.length > 0) {
        const wallet = await client.query(
          'SELECT id, organization_id as "organizationId", balance, total_granted as "totalGranted", total_consumed as "totalConsumed" FROM credit_wallets WHERE organization_id = $1',
          [organizationId]
        );
        return wallet.rows[0];
      }

      const walletResult = await client.query(
        'SELECT id, balance FROM credit_wallets WHERE organization_id = $1 FOR UPDATE',
        [organizationId]
      );

      let newBalance: number;
      if (walletResult.rows.length === 0) {
        await client.query(
          'INSERT INTO credit_wallets (organization_id, balance, total_granted, total_consumed) VALUES ($1, $2, $3, 0)',
          [organizationId, amount, amount]
        );
        newBalance = amount;
      } else {
        const wallet = walletResult.rows[0];
        newBalance = wallet.balance + amount;
        await client.query(
          'UPDATE credit_wallets SET balance = $1, total_granted = total_granted + $2, updated_at = NOW() WHERE organization_id = $3',
          [newBalance, amount, organizationId]
        );
      }

      await client.query(
        `INSERT INTO credit_transactions (organization_id, type, amount, balance_after, description, reference_type, reference_id, idempotency_key)
         VALUES ($1, 'grant', $2, $3, $4, $5, $6, $7)`,
        [organizationId, amount, newBalance, description, referenceType || null, referenceId || null, idemKey]
      );

      const updatedWallet = await client.query(
        'SELECT id, organization_id as "organizationId", balance, total_granted as "totalGranted", total_consumed as "totalConsumed" FROM credit_wallets WHERE organization_id = $1',
        [organizationId]
      );

      return updatedWallet.rows[0];
    });
  },

  async getTransactions(organizationId: string, limit = 50): Promise<any[]> {
    const result = await query(
      `SELECT id, organization_id as "organizationId", type, amount, balance_after as "balanceAfter", description, reference_type as "referenceType", reference_id as "referenceId", idempotency_key as "idempotencyKey", created_at as "createdAt"
       FROM credit_transactions WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [organizationId, limit]
    );
    return result.rows;
  },

  // Test helper: concurrent deduction test
  async testConcurrentDeduction(organizationId: string, amount: number, concurrency: number): Promise<{ successes: number; failures: number; finalBalance: number }> {
    const walletBefore = await this.getWallet(organizationId);
    const initialBalance = walletBefore?.balance || 0;

    const promises = Array.from({ length: concurrency }, (_, i) => 
      this.consumeCredits(organizationId, amount, `Concurrent test ${i}`, 'test', `test_${i}`, `test_concurrent_${organizationId}_${i}_${Date.now()}`)
    );

    const results = await Promise.all(promises);
    const successes = results.filter(r => r.success).length;
    const failures = results.filter(r => !r.success).length;

    const walletAfter = await this.getWallet(organizationId);
    
    return {
      successes,
      failures,
      finalBalance: walletAfter?.balance || 0,
    };
  }
};
