// Invitations to join an organization, used when sign-up is closed (private mode).
// The owner or an admin invites an email; the link lets that person create an account that joins
// the organization directly, with the invited role and no organization of its own.
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { query, runAsSystem, transaction } from '../db/client.js';
import { config } from '../config/index.js';
import { sessionService } from './session.service.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const INVITE_DAYS = 7;
export const INVITABLE_ROLES = ['Admin', 'Manager', 'SEO_Manager', 'Analyst', 'Editor', 'Client', 'Viewer'] as const;

function inviteUrl(token: string) {
  return `${config.appUrl}/#/invite/${token}`;
}

async function sendInviteEmail(email: string, organizationName: string, url: string): Promise<boolean> {
  if (!process.env.SMTP_URL || !process.env.MAIL_FROM) return false;
  try {
    const smtp = new URL(process.env.SMTP_URL);
    const transport = nodemailer.createTransport({
      host: smtp.hostname,
      port: Number(smtp.port || (smtp.protocol === 'smtps:' ? 465 : 587)),
      secure: smtp.protocol === 'smtps:',
      ...(smtp.username ? { auth: { user: decodeURIComponent(smtp.username), pass: decodeURIComponent(smtp.password) } } : {}),
      connectionTimeout: 10000,
    });
    await transport.sendMail({
      from: process.env.MAIL_FROM,
      to: email,
      subject: `دعوت به ${organizationName} در سئویار`,
      text: `شما به ${organizationName} در سئویار دعوت شده‌اید.\nبرای ساخت حساب این لینک را باز کنید. اعتبار لینک ${INVITE_DAYS} روز است.\n\n${url}`,
    });
    return true;
  } catch {
    console.error('[Email] Invitation delivery failed');
    return false;
  }
}

export const invitationService = {
  /** Called inside the inviter's tenant context. Returns the link so it can also be shared by hand. */
  async create(organizationId: string, invitedBy: string, actorRole: string, email: string, role: string) {
    if (!(INVITABLE_ROLES as readonly string[]).includes(role) || (role === 'Admin' && actorRole !== 'Owner')) {
      throw { status: 403, code: 'FORBIDDEN', message: 'Role cannot be assigned' };
    }
    if (!['Owner', 'Admin'].includes(actorRole)) throw { status: 403, code: 'FORBIDDEN', message: 'Admin required' };
    const normalized = email.trim().toLowerCase();
    const token = randomBytes(32).toString('base64url');
    const org = await query('SELECT name FROM organizations WHERE id=$1', [organizationId]);
    const row = await transaction(async () => {
      // A new invitation replaces an open one for the same address.
      await query(`UPDATE organization_invitations SET revoked_at = NOW()
        WHERE organization_id=$1 AND lower(email)=$2 AND accepted_at IS NULL AND revoked_at IS NULL`, [organizationId, normalized]);
      const inserted = await query(
        `INSERT INTO organization_invitations (organization_id, email, role, token_hash, invited_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + make_interval(days => $6))
         RETURNING id, email, role, expires_at AS "expiresAt", created_at AS "createdAt"`,
        [organizationId, normalized, role, digest(token), invitedBy, INVITE_DAYS],
      );
      return inserted.rows[0];
    });
    const url = inviteUrl(token);
    const emailed = await sendInviteEmail(normalized, org.rows[0]?.name ?? 'سئویار', url);
    return { ...row, invited: true, inviteUrl: url, emailed };
  },

  async list(organizationId: string) {
    const rows = await query(
      `SELECT id, email, role, expires_at AS "expiresAt", created_at AS "createdAt"
       FROM organization_invitations
       WHERE organization_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC`, [organizationId]);
    return rows.rows;
  },

  async revoke(organizationId: string, actorRole: string, id: string) {
    if (!['Owner', 'Admin'].includes(actorRole)) throw { status: 403, code: 'FORBIDDEN', message: 'Admin required' };
    const result = await query(`UPDATE organization_invitations SET revoked_at = NOW()
      WHERE id=$1 AND organization_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id`, [id, organizationId]);
    if (!result.rows.length) throw { status: 404, code: 'NOT_FOUND', message: 'Invitation not found' };
  },

  /** Public: what the invitation page shows before the person sets a password. */
  async describe(token: string) {
    return runAsSystem(async () => {
      const found = await query(
        `SELECT i.email, i.role, o.name AS "organizationName" FROM organization_invitations i
         JOIN organizations o ON o.id = i.organization_id
         WHERE i.token_hash=$1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > NOW()`, [digest(token)]);
      return found.rows[0] ?? null;
    });
  },

  /** Creates the account and the membership in one step; the link proves the address was chosen by the inviter. */
  async accept(token: string, password: string, name: string) {
    return runAsSystem(() => transaction(async () => {
      const found = await query(
        `SELECT id, organization_id, email, role FROM organization_invitations
         WHERE token_hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > NOW() FOR UPDATE`, [digest(token)]);
      const invite = found.rows[0];
      if (!invite) throw { status: 404, code: 'INVITATION_INVALID', message: 'Invitation is invalid or expired' };
      const existing = await query('SELECT id FROM users WHERE lower(email)=$1', [invite.email]);
      if (existing.rows.length) throw { status: 409, code: 'CONFLICT', message: 'Account already exists; ask the admin to add it to the team' };
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await query(
        `INSERT INTO users (email, name, password_hash, email_verified) VALUES ($1, $2, $3, true)
         RETURNING id, email, name`, [invite.email, name, passwordHash]);
      await query('INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, $3)', [invite.organization_id, user.rows[0].id, invite.role]);
      await query('UPDATE organization_invitations SET accepted_at = NOW() WHERE id=$1', [invite.id]);
      const org = await query('SELECT id, name, slug, plan, created_at AS "createdAt", white_label AS "whiteLabel" FROM organizations WHERE id=$1', [invite.organization_id]);
      const session = await sessionService.create(user.rows[0].id, invite.organization_id, invite.role, invite.email);
      return { user: user.rows[0], organization: org.rows[0], ...session };
    }));
  },
};
