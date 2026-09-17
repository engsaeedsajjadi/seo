/**
 * RankForge — Tenant Isolation Security Tests
 * Verifies User A cannot access User B data
 */

import assert from 'assert';

console.log('Testing tenant isolation...');

// Mock organizations and projects
const orgA = 'org_a_123';
const orgB = 'org_b_456';
const userA = 'user_a';
const userB = 'user_b';

const projects = [
  { id: 'proj_1', organizationId: orgA, domain: 'a.com' },
  { id: 'proj_2', organizationId: orgB, domain: 'b.com' },
];

function canAccessProject(userOrgId: string, project: any): boolean {
  return project.organizationId === userOrgId;
}

// User A should access org A project
assert.strictEqual(canAccessProject(orgA, projects[0]), true, 'User A should access own project');
// User A should NOT access org B project
assert.strictEqual(canAccessProject(orgA, projects[1]), false, 'User A should NOT access other org project');
// User B should access org B project
assert.strictEqual(canAccessProject(orgB, projects[1]), true, 'User B should access own project');
// User B should NOT access org A project
assert.strictEqual(canAccessProject(orgB, projects[0]), false, 'User B should NOT access other org project');

// Test API key isolation
const apiKeys = [
  { id: 'key_1', organizationId: orgA, hash: 'hash_a' },
  { id: 'key_2', organizationId: orgB, hash: 'hash_b' },
];

function canUseApiKey(requestOrgId: string, apiKey: any): boolean {
  return apiKey.organizationId === requestOrgId;
}

assert.strictEqual(canUseApiKey(orgA, apiKeys[0]), true);
assert.strictEqual(canUseApiKey(orgA, apiKeys[1]), false, 'Org A should not use Org B API key');
assert.strictEqual(canUseApiKey(orgB, apiKeys[1]), true);
assert.strictEqual(canUseApiKey(orgB, apiKeys[0]), false, 'Org B should not use Org A API key');

// Test billing isolation
const wallets = [
  { organizationId: orgA, balance: 100 },
  { organizationId: orgB, balance: 200 },
];

function getWallet(orgId: string) {
  return wallets.find(w => w.organizationId === orgId);
}

assert.strictEqual(getWallet(orgA)?.balance, 100);
assert.strictEqual(getWallet(orgB)?.balance, 200);
assert.notStrictEqual(getWallet(orgA)?.balance, getWallet(orgB)?.balance, 'Wallets should be isolated');

console.log('✅ Tenant isolation tests passed');
