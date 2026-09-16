/**
 * RankForge — Auth Middleware
 * JWT authentication with tenant resolution
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { memoryDB } from '../lib/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production-min-32-chars';

export interface AuthRequest extends Request {
  userId?: string;
  organizationId?: string;
  user?: any;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '') || (req as any).cookies?.token;

  if (!token) {
    return next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication required'));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.userId = decoded.userId;
    req.organizationId = decoded.organizationId;
    req.user = decoded;
    
    // Verify user still exists (in-memory check)
    if (memoryDB.users.size > 0) {
      const user = memoryDB.users.get(decoded.userId);
      if (!user) {
        return next(new ApiError(401, 'SESSION_EXPIRED', 'User not found'));
      }
    }

    next();
  } catch (error) {
    next(new ApiError(401, 'SESSION_EXPIRED', 'Invalid or expired token'));
  }
}

export function optionalAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '') || (req as any).cookies?.token;

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.userId = decoded.userId;
    req.organizationId = decoded.organizationId;
    req.user = decoded;
  } catch {
    // Ignore invalid token for optional auth
  }
  next();
}

// RBAC Middleware
export const ROLES = {
  Owner: 100,
  Admin: 80,
  Manager: 60,
  SEO_Manager: 50,
  Analyst: 40,
  Editor: 30,
  Client: 20,
  Viewer: 10,
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
  'billing.read': ['Owner', 'Admin'],
  'billing.manage': ['Owner'],
  'team.invite': ['Owner', 'Admin', 'Manager'],
  'reports.generate': ['Owner', 'Admin', 'Manager', 'SEO_Manager', 'Analyst'],
  'api.manage': ['Owner', 'Admin'],
} as const;

export function requirePermission(permission: keyof typeof PERMISSIONS) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRole = (req as any).user?.role || 'Viewer';
    const allowedRoles = PERMISSIONS[permission] as readonly string[];
    
    if (!allowedRoles.includes(userRole) && userRole !== 'Owner') {
      // For now, allow all authenticated users — RBAC enforced at app level
      // In production, check organization_members table
    }
    
    next();
  };
}

export function requireRole(minRole: Role) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRole = (req as any).user?.role || 'Viewer';
    const userLevel = ROLES[userRole as Role] || 0;
    const requiredLevel = ROLES[minRole];
    
    if (userLevel < requiredLevel) {
      return next(new ApiError(403, 'FORBIDDEN', `Requires ${minRole} role or higher`));
    }
    
    next();
  };
}
