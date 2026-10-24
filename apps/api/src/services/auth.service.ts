/**
 * RankForge — Auth Service
 * Real PostgreSQL, no memoryDB
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { userRepository } from '../repositories/user.repository.js';
import { organizationRepository } from '../repositories/organization.repository.js';
import { creditRepository } from '../repositories/credit.repository.js';
import { auditLogRepository } from '../repositories/audit-log.repository.js';
import { config } from '../config/index.js';

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 50) + '-' + Math.random().toString(36).substring(2, 6);
}

export const authService = {
  async signup(email: string, password: string, name: string, ipAddress?: string, userAgent?: string) {
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw { status: 409, code: 'CONFLICT', message: 'Email already registered' };
    }

    if (password.length < 8) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' };
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await userRepository.create({ email, name, passwordHash });

    const org = await organizationRepository.create({
      name: `${name}'s Organization`,
      slug: generateSlug(name),
      ownerId: user.id,
      plan: 'FREE',
    });

    await organizationRepository.addMember(org.id, user.id, 'Owner');
    await creditRepository.createWallet(org.id, 100);

    await auditLogRepository.create({
      organizationId: org.id,
      userId: user.id,
      action: 'user.signup',
      resourceType: 'user',
      resourceId: user.id,
      details: { email },
      ipAddress,
      userAgent,
    });

    const token = jwt.sign(
      { userId: user.id, organizationId: org.id, role: 'Owner', email: user.email },
      config.auth.jwtSecret,
      { expiresIn: '7d', issuer: 'rankforge', audience: 'rankforge-app' }
    );

    return { user, organization: org, token };
  },

  async login(email: string, password: string, ipAddress?: string, userAgent?: string) {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw { status: 401, code: 'UNAUTHENTICATED', message: 'Invalid credentials' };
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw { status: 401, code: 'UNAUTHENTICATED', message: 'Invalid credentials' };
    }

    const orgs = await organizationRepository.findByUserId(user.id);
    if (orgs.length === 0) {
      throw { status: 404, code: 'NOT_FOUND', message: 'No organization found for user' };
    }

    const org = orgs[0];
    const role = await organizationRepository.getMemberRole(org.id, user.id) || 'Owner';

    await auditLogRepository.create({
      organizationId: org.id,
      userId: user.id,
      action: 'user.login',
      resourceType: 'user',
      resourceId: user.id,
      details: { email },
      ipAddress,
      userAgent,
    });

    const token = jwt.sign(
      { userId: user.id, organizationId: org.id, role, email: user.email },
      config.auth.jwtSecret,
      { expiresIn: '7d', issuer: 'rankforge', audience: 'rankforge-app' }
    );

    return { user, organization: org, token };
  },

  async getCurrentUser(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) return null;

    const orgs = await organizationRepository.findByUserId(userId);
    const organizationId = orgs[0]?.id;

    return { user, organizationId, organizations: orgs };
  },
};
