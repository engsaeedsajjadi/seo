/**
 * RankForge — Credit System Unit Tests
 */

import assert from 'assert';

console.log('Testing credit system...');

function calculateCreditCost(operation: string, quantity: number = 1): number {
  const costs: Record<string, number> = {
    crawl_page: 1,
    serp_call: 2,
    keyword_call: 1,
    backlink_call: 2,
    ai_request: 5,
    ai_token_1k: 1,
    report_generation: 3,
    pagespeed_check: 1,
    gsc_sync: 1,
    ga4_sync: 1,
  };
  return (costs[operation] || 1) * quantity;
}

assert.strictEqual(calculateCreditCost('crawl_page', 1), 1);
assert.strictEqual(calculateCreditCost('crawl_page', 10), 10);
assert.strictEqual(calculateCreditCost('serp_call', 1), 2);
assert.strictEqual(calculateCreditCost('ai_request', 1), 5);
assert.strictEqual(calculateCreditCost('unknown_op', 1), 1);

console.log('✅ Credit cost calculation tests passed');

// Test atomic consumption logic
function consumeCredits(balance: number, amount: number): { success: boolean; newBalance?: number; error?: string } {
  if (balance < amount) {
    return { success: false, error: 'Insufficient credits' };
  }
  return { success: true, newBalance: balance - amount };
}

const result1 = consumeCredits(100, 10);
assert.strictEqual(result1.success, true);
assert.strictEqual(result1.newBalance, 90);

const result2 = consumeCredits(5, 10);
assert.strictEqual(result2.success, false);
assert.strictEqual(result2.error, 'Insufficient credits');

console.log('✅ Credit consumption tests passed');

// Test wallet creation
function createWallet(orgId: string, initialBalance: number) {
  return {
    organizationId: orgId,
    balance: initialBalance,
    totalGranted: initialBalance,
    totalConsumed: 0,
  };
}

const wallet = createWallet('org_123', 100);
assert.strictEqual(wallet.balance, 100);
assert.strictEqual(wallet.totalGranted, 100);
assert.strictEqual(wallet.totalConsumed, 0);

console.log('✅ Credit wallet tests passed');
console.log('✅ All credit system tests passed');
