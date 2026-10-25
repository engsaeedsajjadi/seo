import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { query, transaction } from '../db/client.js';
import { config } from '../config/index.js';

const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export const passwordRecoveryService={
  async request(email:string) {
    if (!process.env.SMTP_URL || !process.env.MAIL_FROM) throw {status:503,code:'SERVICE_UNAVAILABLE',message:'Password recovery email is not configured'};
    const user=await query('SELECT id FROM users WHERE email=$1 AND deleted_at IS NULL',[email.toLowerCase()]);
    if (!user.rows[0]) return;
    const token=randomBytes(32).toString('hex');
    await transaction(async()=>{
      await query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.rows[0].id]);
      await query('DELETE FROM password_reset_tokens WHERE user_id=$1',[user.rows[0].id]);
      await query("INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES ($1,$2,NOW()+INTERVAL '1 hour')",[digest(token),user.rows[0].id]);
    });
    const smtp=new URL(process.env.SMTP_URL);
    const transport=nodemailer.createTransport({host:smtp.hostname,port:Number(smtp.port || (smtp.protocol==='smtps:'?465:587)),secure:smtp.protocol==='smtps:',
      ...(smtp.username?{auth:{user:decodeURIComponent(smtp.username),pass:decodeURIComponent(smtp.password)}}:{}),connectionTimeout:10000,socketTimeout:15000});
    try {
      await transport.sendMail({from:process.env.MAIL_FROM,to:email,
        subject:'بازیابی رمز عبور رنک‌فورج',
        text:`برای تعیین رمز جدید، این لینک را باز کنید. اعتبار لینک یک ساعت است.\n${config.appUrl.replace(/\/$/,'')}/#/reset-password?token=${token}\nاگر این درخواست متعلق به شما نیست، آن را نادیده بگیرید.`,
      });
    } catch {
      // Do not expose account existence or SMTP credentials via the public response/logs.
      await query('DELETE FROM password_reset_tokens WHERE token_hash=$1',[digest(token)]);
      console.error('[Email] Password recovery delivery failed');
    } finally {transport.close();}
  },
  async reset(token:string,password:string) {
    // Hash before acquiring the row lock; two consumers still serialize on the token row.
    const passwordHash=await bcrypt.hash(password,12);
    await transaction(async()=>{
      const lookup=await query('SELECT user_id FROM password_reset_tokens WHERE token_hash=$1',[digest(token)]);
      if(!lookup.rows[0])throw {status:400,code:'VALIDATION_ERROR',message:'Reset link is invalid or expired'};
      await query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[lookup.rows[0].user_id]);
      const reset=await query(`SELECT t.user_id FROM password_reset_tokens t JOIN users u ON u.id=t.user_id AND u.deleted_at IS NULL
        WHERE t.token_hash=$1 AND t.used_at IS NULL AND t.expires_at>NOW() FOR UPDATE OF t`,[digest(token)]);
      if(!reset.rows[0])throw {status:400,code:'VALIDATION_ERROR',message:'Reset link is invalid or expired'};
      const userId=reset.rows[0].user_id;
      await query('UPDATE password_reset_tokens SET used_at=NOW() WHERE user_id=$1',[userId]);
      await query('UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2',[passwordHash,userId]);
      await query('UPDATE auth_sessions SET revoked_at=NOW() WHERE user_id=$1',[userId]);
    });
  },
};
