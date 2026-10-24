/**
 * RankForge — Auth Middleware
 * JWT authentication, tenant resolution and PostgreSQL RLS context.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { query, runWithDbContext } from '../db/client.js';
import { organizationRepository } from '../repositories/organization.repository.js';

export interface AuthRequest extends Request {
  userId?: string;
  organizationId?: string;
  user?: any;
  requestId?: string;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '') || (req as any).cookies?.token;
  if (!token) return next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication required'));

  try {
    const decoded = jwt.verify(token, config.auth.jwtSecret, {
      issuer: 'rankforge', audience: 'rankforge-app', algorithms: ['HS256'],
    }) as any;

    if (!decoded.userId || !decoded.organizationId) {
      return next(new ApiError(401, 'INVALID_SESSION', 'Session has no tenant context'));
    }

    req.userId = decoded.userId;
    req.organizationId = decoded.organizationId;
    req.user = decoded;

    await runWithDbContext(
      { userId: decoded.userId, organizationId: decoded.organizationId },
      async () => {
        const userResult = await query('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [decoded.userId]);
        if (userResult.rows.length === 0) throw new ApiError(401, 'SESSION_EXPIRED', 'User not found or deleted');
        const isMember = await organizationRepository.isMember(decoded.organizationId, decoded.userId);
        if (!isMember) throw new ApiError(403, 'FORBIDDEN', 'Not a member of this organization');
      },
    );

    return runWithDbContext(
      { userId: decoded.userId, organizationId: decoded.organizationId },
      () => next(),
    );
  } catch (error: any) {
    if (error instanceof ApiError) return next(error);
    if (error.name === 'TokenExpiredError') return next(new ApiError(401, 'SESSION_EXPIRED', 'Token expired'));
    if (error.name === 'JsonWebTokenError') return next(new ApiError(401, 'SESSION_EXPIRED', 'Invalid token'));
    return next(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Database unavailable'));
  }
}

export function optionalAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '') || (req as any).cookies?.token;
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, config.auth.jwtSecret, {
      issuer: 'rankforge', audience: 'rankforge-app', algorithms: ['HS256'],
    }) as any;
    req.userId = decoded.userId;
    req.organizationId = decoded.organizationId;
    req.user = decoded;
  } catch { /* Optional auth intentionally ignores invalid credentials. */ }
  next();
}

export const ROLES = {
  Owner: 100, Admin: 80, Manager: 60, SEO_Manager: 50,
  Analyst: 40, Editor: 30, Client: 20, Viewer: 10,
} as const;
export type Role = keyof typeof ROLES;

export const PERMISSIONS = {
  'project.read': ['Owner', 'Admin', 'Manager', 'SEO_Manager', 'Analyst', 'Editor', 'Client', 'Viewer'],
  'project.write': ['Owner', 'Admin', 'Manager', 'SEO_Manager', 'Editor'],
  'project.delete': ['Owner', 'Admin'],
  'seo.audit.run': ['Owner', 'Admin', 'Manager', 'SEO_Manager', 'Analyst'],
  'seo.audit.read': ['Owner', 'Admin', 'Manager', 'SEO_Manager', 'Analyst', 'Editor', 'Client', 'Viewer'],
  'keyword.read': ['Owner', 'Admin', 'Manager', 'SEO_Manager', 'Analyst', 'Editor', 'Client', 'Viewer'],
  'keyword.write': ['Owner', 'Admin', 'Manager', 'SEO_Manager', 'Editor'],
  'rank.read': ['Owner', 'Admin', 'Manager', 'SEO_Manager', 'Analyst', 'Editor', 'Client', 'Viewer'],
  'billing.read': ['Owner', 'Admin'], 'billing.manage': ['Owner'],
  'team.invite': ['Owner', 'Admin', 'Manager'],
  'reports.generate': ['Owner', 'Admin', 'Manager', 'SEO_Manager', 'Analyst'],
  'api.manage': ['Owner', 'Admin'],
} as const;

export function requirePermission(permission: keyof typeof PERMISSIONS) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRole = (req as any).user?.role || 'Viewer';
    const allowedRoles = PERMISSIONS[permission] as readonly string[];
    if (!allowedRoles.includes(userRole) && userRole !== 'Owner') {
      if (config.isProduction) return next(new ApiError(403, 'FORBIDDEN', `Requires permission: ${permission}`));
    }
    next();
  };
}

export function requireRole(minRole: Role) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRole = (req as any).user?.role || 'Viewer';
    const userLevel = ROLES[userRole as Role] || 0;
    const requiredLevel = ROLES[minRole];
    if (userLevel < requiredLevel) return next(new ApiError(403, 'FORBIDDEN', `Requires ${minRole} role or higher`));
    next();
  };
}
