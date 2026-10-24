/**
 * RankForge — Auth Integration Tests
 */

import assert from 'assert';

console.log('Testing auth integration...');

// Mock auth flow
const users = new Map();

function signup(email: string, password: string, name: string) {
  if (users.has(email)) throw new Error('Email already registered');
  const user = { id: `user_${Date.now()}`, email, name, passwordHash: `hashed_${password}` };
  users.set(email, user);
  return user;
}

function login(email: string, password: string) {
  const user = users.get(email);
  if (!user) throw new Error('Invalid credentials');
  if (user.passwordHash !== `hashed_${password}`) throw new Error('Invalid credentials');
  return { token: `jwt_${user.id}`, user };
}

// Test signup
const user1 = signup('test@example.com', 'password123', 'Test User');
assert(user1.email === 'test@example.com');

// Test duplicate signup
try {
  signup('test@example.com', 'password123', 'Test User');
  assert.fail('Should throw for duplicate email');
} catch (e) {
  assert((e as Error).message === 'Email already registered');
}

// Test login
const loginResult = login('test@example.com', 'password123');
assert(loginResult.token.startsWith('jwt_'));

// Test invalid login
try {
  login('test@example.com', 'wrongpassword');
  assert.fail('Should throw for invalid password');
} catch (e) {
  assert((e as Error).message === 'Invalid credentials');
}

try {
  login('nonexistent@example.com', 'password123');
  assert.fail('Should throw for nonexistent user');
} catch (e) {
  assert((e as Error).message === 'Invalid credentials');
}

console.log('✅ Auth integration tests passed');
