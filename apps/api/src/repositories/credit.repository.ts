/**
 * RankForge — Credit Repository
 * Real atomic credit ledger
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

  async consumeCredits(organizationId: string, amount: number, description: string, referenceType?: string, referenceId?: string): Promise<{ success: boolean; wallet?: any; error?: string }> {
    return transaction(async (client) => {
      // Lock wallet row
      const walletResult = await client.query(
        'SELECT id, balance FROM credit_wallets WHERE organization_id = $1 FOR UPDATE',
        [organizationId]
      );

      if (walletResult.rows.length === 0) {
        return { success: false, error: 'Wallet not found' };
      }

      const wallet = walletResult.rows[0];
      if (wallet.balance < amount) {
        return { success: false, error: 'Insufficient credits' };
      }

      const newBalance = wallet.balance - amount;

      await client.query(
        'UPDATE credit_wallets SET balance = $1, total_consumed = total_consumed + $2, updated_at = NOW() WHERE organization_id = $3',
        [newBalance, amount, organizationId]
      );

      await client.query(
        `INSERT INTO credit_transactions (organization_id, type, amount, balance_after, description, reference_type, reference_id)
         VALUES ($1, 'consumption', $2, $3, $4, $5, $6)`,
        [organizationId, -amount, newBalance, description, referenceType || null, referenceId || null]
      );

      const updatedWallet = await client.query(
        'SELECT id, organization_id as "organizationId", balance, total_granted as "totalGranted", total_consumed as "totalConsumed" FROM credit_wallets WHERE organization_id = $1',
        [organizationId]
      );

      return { success: true, wallet: updatedWallet.rows[0] };
    });
  },

  async grantCredits(organizationId: string, amount: number, description: string, referenceType?: string, referenceId?: string): Promise<any> {
    return transaction(async (client) => {
      const walletResult = await client.query(
        'SELECT id, balance FROM credit_wallets WHERE organization_id = $1 FOR UPDATE',
        [organizationId]
      );

      let newBalance: number;
      if (walletResult.rows.length === 0) {
        // Create wallet
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
        `INSERT INTO credit_transactions (organization_id, type, amount, balance_after, description, reference_type, reference_id)
         VALUES ($1, 'grant', $2, $3, $4, $5, $6)`,
        [organizationId, amount, newBalance, description, referenceType || null, referenceId || null]
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
      `SELECT id, organization_id as "organizationId", type, amount, balance_after as "balanceAfter", description, reference_type as "referenceType", reference_id as "referenceId", created_at as "createdAt"
       FROM credit_transactions WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [organizationId, limit]
    );
    return result.rows;
  },
};
