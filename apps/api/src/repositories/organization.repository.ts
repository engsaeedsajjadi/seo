/**
 * RankForge — Organization Repository
 * Real PostgreSQL with tenant isolation
 */

import { query } from '../db/client.js';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: string;
  ownerId: string;
  settings?: any;
  whiteLabel?: any;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  permissions?: any;
  createdAt: Date;
}

export const organizationRepository = {
  async findById(id: string): Promise<Organization | null> {
    const result = await query(
      `SELECT id, name, slug, plan, stripe_customer_id as "stripeCustomerId", 
              stripe_subscription_id as "stripeSubscriptionId", subscription_status as "subscriptionStatus",
              owner_id as "ownerId", settings, white_label as "whiteLabel",
              created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt"
       FROM organizations WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return result.rows[0] || null;
  },

  async findBySlug(slug: string): Promise<Organization | null> {
    const result = await query(
      `SELECT id, name, slug, plan, stripe_customer_id as "stripeCustomerId", 
              stripe_subscription_id as "stripeSubscriptionId", subscription_status as "subscriptionStatus",
              owner_id as "ownerId", settings, white_label as "whiteLabel",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM organizations WHERE slug = $1 AND deleted_at IS NULL`,
      [slug]
    );
    return result.rows[0] || null;
  },

  async findByUserId(userId: string): Promise<Organization[]> {
    const result = await query(
      `SELECT o.id, o.name, o.slug, o.plan, o.stripe_customer_id as "stripeCustomerId",
              o.stripe_subscription_id as "stripeSubscriptionId", o.subscription_status as "subscriptionStatus",
              o.owner_id as "ownerId", o.settings, o.white_label as "whiteLabel",
              o.created_at as "createdAt", o.updated_at as "updatedAt"
       FROM organizations o
       JOIN organization_members om ON om.organization_id = o.id
       WHERE om.user_id = $1 AND o.deleted_at IS NULL
       ORDER BY o.created_at DESC`,
      [userId]
    );
    return result.rows;
  },

  async create(data: { name: string; slug: string; ownerId: string; plan?: string }): Promise<Organization> {
    const result = await query(
      `INSERT INTO organizations (name, slug, owner_id, plan)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, slug, plan, owner_id as "ownerId", created_at as "createdAt", updated_at as "updatedAt"`,
      [data.name, data.slug, data.ownerId, data.plan || 'FREE']
    );
    return result.rows[0];
  },

  async update(id: string, data: Partial<{ name: string; plan: string; settings: any; whiteLabel: any; stripeCustomerId: string; stripeSubscriptionId: string; subscriptionStatus: string }>): Promise<Organization | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.plan !== undefined) {
      fields.push(`plan = $${idx++}`);
      values.push(data.plan);
    }
    if (data.settings !== undefined) {
      fields.push(`settings = $${idx++}`);
      values.push(JSON.stringify(data.settings));
    }
    if (data.whiteLabel !== undefined) {
      fields.push(`white_label = $${idx++}`);
      values.push(JSON.stringify(data.whiteLabel));
    }
    if (data.stripeCustomerId !== undefined) {
      fields.push(`stripe_customer_id = $${idx++}`);
      values.push(data.stripeCustomerId);
    }
    if (data.stripeSubscriptionId !== undefined) {
      fields.push(`stripe_subscription_id = $${idx++}`);
      values.push(data.stripeSubscriptionId);
    }
    if (data.subscriptionStatus !== undefined) {
      fields.push(`subscription_status = $${idx++}`);
      values.push(data.subscriptionStatus);
    }

    if (fields.length === 0) return this.findById(id);

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `UPDATE organizations SET ${fields.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL
       RETURNING id, name, slug, plan, owner_id as "ownerId", settings, white_label as "whiteLabel", created_at as "createdAt", updated_at as "updatedAt"`,
      values
    );
    return result.rows[0] || null;
  },

  async addMember(organizationId: string, userId: string, role: string = 'Viewer'): Promise<OrganizationMember> {
    const result = await query(
      `INSERT INTO organization_members (organization_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role
       RETURNING id, organization_id as "organizationId", user_id as "userId", role, created_at as "createdAt"`,
      [organizationId, userId, role]
    );
    return result.rows[0];
  },

  async getMembers(organizationId: string): Promise<any[]> {
    const result = await query(
      `SELECT om.id, om.organization_id as "organizationId", om.user_id as "userId", om.role, om.created_at as "createdAt",
              u.email, u.name
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.organization_id = $1 AND u.deleted_at IS NULL
       ORDER BY om.created_at ASC`,
      [organizationId]
    );
    return result.rows;
  },

  async isMember(organizationId: string, userId: string): Promise<boolean> {
    const result = await query(
      'SELECT id FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [organizationId, userId]
    );
    return result.rows.length > 0;
  },

  async getMemberRole(organizationId: string, userId: string): Promise<string | null> {
    const result = await query(
      'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [organizationId, userId]
    );
    return result.rows[0]?.role || null;
  },
};
