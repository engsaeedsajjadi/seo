import { query, transaction } from '../db/client.js';
const roles = ['Admin','Manager','SEO_Manager','Analyst','Editor','Client','Viewer'];
export const teamService = {
  async add(organizationId: string, actorRole: string, email: string, role: string) {
    if (!roles.includes(role) || (role === 'Admin' && actorRole !== 'Owner')) throw {status:403,code:'FORBIDDEN',message:'Role cannot be assigned'};
    return transaction(async () => {
      const org = await query('SELECT plan FROM organizations WHERE id=$1 FOR UPDATE',[organizationId]);
      const plan = await query('SELECT limits FROM plans WHERE id=$1',[org.rows[0]?.plan]);
      if (!plan.rows[0]) throw {status:503,code:'SERVICE_UNAVAILABLE',message:'Plan configuration unavailable'};
      const count = await query('SELECT COUNT(*)::int AS total FROM organization_members WHERE organization_id=$1',[organizationId]);
      const limit = Number(plan.rows[0].limits.users);
      if (!Number.isFinite(limit) || (limit >= 0 && count.rows[0].total >= limit)) throw {status:403,code:'LIMIT_REACHED',message:'Team member limit reached'};
      const user = await query('SELECT id FROM users WHERE email=$1 AND deleted_at IS NULL',[email.toLowerCase()]);
      if (!user.rows[0]) throw {status:404,code:'NOT_FOUND',message:'Ask this person to create an account first'};
      const added = await query(`INSERT INTO organization_members (organization_id,user_id,role) VALUES ($1,$2,$3)
        ON CONFLICT (organization_id,user_id) DO NOTHING RETURNING id`,[organizationId,user.rows[0].id,role]);
      if (!added.rows.length) throw {status:409,code:'CONFLICT',message:'User is already a member'};
      return added.rows[0];
    });
  },
};
