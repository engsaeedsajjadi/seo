import { createHash, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { query, runAsSystem, transaction } from '../db/client.js';
import { config } from '../config/index.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const smtpConfigured = () => !!(process.env.SMTP_URL && process.env.MAIL_FROM);

/** Verification needs a way to deliver the email. Without SMTP nobody could ever pass it. */
export const verificationRequired = () => process.env.REQUIRE_EMAIL_VERIFICATION !== 'false' && smtpConfigured();

export const emailVerificationService = {
  /** Best effort: a mail outage must not fail signup. The user can resend from the app. */
  async send(userId: string) {
    if (!smtpConfigured()) return;
    await runAsSystem(async () => {
      const user = await query('SELECT email, email_verified FROM users WHERE id=$1 AND deleted_at IS NULL', [userId]);
      if (!user.rows[0] || user.rows[0].email_verified) return;
      const token = randomBytes(32).toString('hex');
      await transaction(async () => {
        await query('DELETE FROM email_verification_tokens WHERE user_id=$1', [userId]);
        await query(`INSERT INTO email_verification_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '24 hours')`, [digest(token), userId]);
      });
      const smtp = new URL(process.env.SMTP_URL!);
      const transport = nodemailer.createTransport({
        host: smtp.hostname,
        port: Number(smtp.port || (smtp.protocol === 'smtps:' ? 465 : 587)),
        secure: smtp.protocol === 'smtps:',
        ...(smtp.username ? { auth: { user: decodeURIComponent(smtp.username), pass: decodeURIComponent(smtp.password) } } : {}),
        connectionTimeout: 10000,
      });
      try {
        await transport.sendMail({
          from: process.env.MAIL_FROM,
          to: user.rows[0].email,
          subject: 'تأیید ایمیل رنک‌فورج',
          text: `برای تأیید ایمیل، این لینک را باز کنید. اعتبار لینک ۲۴ ساعت است.\n\n${config.appUrl}/#/verify-email?token=${token}`,
        });
      } catch {
        console.error('[Email] Verification delivery failed');
      } finally {
        transport.close();
      }
    });
  },

  async verify(token: string) {
    await runAsSystem(() => transaction(async () => {
      const found = await query(`DELETE FROM email_verification_tokens WHERE token_hash=$1 AND expires_at > NOW() RETURNING user_id`, [digest(token)]);
      if (!found.rows[0]) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Verification link is invalid or expired' };
      await query('UPDATE users SET email_verified=true, updated_at=NOW() WHERE id=$1', [found.rows[0].user_id]);
    }));
  },

  async isVerified(userId: string): Promise<boolean> {
    const user = await query('SELECT email_verified FROM users WHERE id=$1', [userId]);
    return user.rows[0]?.email_verified === true;
  },
};
