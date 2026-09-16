/**
 * RankForge — SSRF Protection Unit Tests
 */

import { isPrivateIP, isIPv4Blocked } from '../../packages/security/src/ssrf.js';
import assert from 'assert';

console.log('Testing SSRF protection...');

// Private IPs should be blocked
assert.strictEqual(isPrivateIP('127.0.0.1'), true, '127.0.0.1 should be blocked');
assert.strictEqual(isPrivateIP('127.0.0.2'), true, '127.0.0.2 should be blocked');
assert.strictEqual(isPrivateIP('10.0.0.1'), true, '10.0.0.1 should be blocked');
assert.strictEqual(isPrivateIP('10.255.255.255'), true, '10.255.255.255 should be blocked');
assert.strictEqual(isPrivateIP('172.16.0.1'), true, '172.16.0.1 should be blocked');
assert.strictEqual(isPrivateIP('172.31.255.255'), true, '172.31.255.255 should be blocked');
assert.strictEqual(isPrivateIP('192.168.1.1'), true, '192.168.1.1 should be blocked');
assert.strictEqual(isPrivateIP('169.254.169.254'), true, 'AWS metadata should be blocked');
assert.strictEqual(isPrivateIP('::1'), true, '::1 should be blocked');

// Public IPs should not be blocked
assert.strictEqual(isPrivateIP('8.8.8.8'), false, '8.8.8.8 should not be blocked');
assert.strictEqual(isPrivateIP('1.1.1.1'), false, '1.1.1.1 should not be blocked');
assert.strictEqual(isPrivateIP('142.250.80.14'), false, 'Google IP should not be blocked');

console.log('✅ SSRF protection tests passed');
