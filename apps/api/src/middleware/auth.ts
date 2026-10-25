/**
 * RankForge — Auth Middleware
 * JWT authentication, tenant resolution and PostgreSQL RLS context.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { query, runWithDbContext } from '../db/client.js';
import { createHash } from 'node:crypto';
import { routeAllowed } from './access-policy.js';
import { organizationRepository } from '../repositories/organization.repository.js';

export interface AuthRequest extends Request {
  userId?: string;
  organizationId?: string;
  user?: any;
  requestId?: string;
  sessionId?: string;
  apiKeyId?: string;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication required'));

  try {
    for (const [key,value] of Object.entries(req.params)) {
      if ((key === 'id' || key.endsWith('Id')) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        throw new ApiError(400,'VALIDATION_ERROR','Invalid resource identifier');
      }
    }
    if (token.startsWith('rf_')) {
      const key = await query(`SELECT k.id,k.organization_id,o.owner_id,k.scopes FROM api_keys k
        JOIN organizations o ON o.id=k.organization_id AND o.deleted_at IS NULL
        JOIN users u ON u.id=o.owner_id AND u.deleted_at IS NULL
        WHERE k.key_hash=$1 AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at>NOW())`,
        [createHash('sha256').update(token).digest('hex')]);
      const row=key.rows[0];
      if (!row) throw new ApiError(401,'UNAUTHENTICATED','Invalid or revoked API key');
      // Service keys operate on SEO resources only, never account/billing/admin endpoints.
      if (!/^\/api\/v1\/(projects|jobs|integrations\/status)(\/|$)/.test(req.path)) throw new ApiError(403,'FORBIDDEN','API key cannot access account management');
      const read=req.method==='GET' || req.method==='HEAD';
      if (!(row.scopes || []).includes(read?'read':'write')) throw new ApiError(403,'FORBIDDEN','API key scope is insufficient');
      req.organizationId=row.organization_id;req.userId=row.owner_id;req.apiKeyId=row.id;
      req.user={role:read?'Viewer':'SEO_Manager'};
      if (!routeAllowed(req.user.role,req.method,req.path)) throw new ApiError(403,'FORBIDDEN','Operation not permitted for API key');
      return await runWithDbContext({userId:row.owner_id,organizationId:row.organization_id},async()=>{
        await query('UPDATE api_keys SET last_used_at=NOW() WHERE id=$1 AND organization_id=$2',[row.id,row.organization_id]);
        next();
      });
    }
    const decoded = jwt.verify(token, config.auth.jwtSecret, {
      issuer: 'rankforge', audience: 'rankforge-app', algorithms: ['HS256'],
    }) as any;

    if (!decoded.userId || !decoded.organizationId || !decoded.sid) {
      return next(new ApiError(401, 'INVALID_SESSION', 'Session has no tenant context'));
    }

    req.userId = decoded.userId;
    req.organizationId = decoded.organizationId;
    req.user = decoded;

    await runWithDbContext(
      { userId: decoded.userId, organizationId: decoded.organizationId },
      async () => {
        const session = await query(`SELECT m.role FROM auth_sessions s
          JOIN users u ON u.id=s.user_id AND u.deleted_at IS NULL
          JOIN organizations o ON o.id=s.organization_id AND o.deleted_at IS NULL
          JOIN organization_members m ON m.organization_id=s.organization_id AND m.user_id=s.user_id
          WHERE s.id=$1 AND s.user_id=$2 AND s.organization_id=$3
          AND s.revoked_at IS NULL AND s.expires_at>NOW()`, [decoded.sid,decoded.userId,decoded.organizationId]);
        if (!session.rows[0]) throw new ApiError(401, 'SESSION_EXPIRED', 'Session revoked or membership removed');
        req.sessionId = decoded.sid;
        req.user.role = session.rows[0].role;
        if (!routeAllowed(req.user.role, req.method, req.path)) throw new ApiError(403, 'FORBIDDEN', 'Your role cannot perform this action');
        if (req.user.role === 'Client') {
          const projectId = req.params.projectId || req.params.id;
          if (projectId) {
            const assigned = await query(`SELECT 1 FROM client_projects cp JOIN projects p ON p.id=cp.project_id
              WHERE cp.organization_id=$1 AND cp.user_id=$2 AND cp.project_id=$3 AND p.deleted_at IS NULL`,
              [decoded.organizationId,decoded.userId,projectId]);
            if (!assigned.rows.length) throw new ApiError(404, 'NOT_FOUND', 'Project not found');
          }
        }
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
  const token = authHeader?.replace('Bearer ', '');
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
      return next(new ApiError(403, 'FORBIDDEN', `Requires permission: ${permission}`));
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
