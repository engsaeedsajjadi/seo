import nodemailer from 'nodemailer';

export const mailConfigured = () => !!(process.env.SMTP_URL && process.env.MAIL_FROM);

/** Best effort. Addresses and SMTP credentials never reach the log. */
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  if (!mailConfigured()) return false;
  const smtp = new URL(process.env.SMTP_URL!);
  const transport = nodemailer.createTransport({
    host: smtp.hostname,
    port: Number(smtp.port || (smtp.protocol === 'smtps:' ? 465 : 587)),
    secure: smtp.protocol === 'smtps:',
    ...(smtp.username ? { auth: { user: decodeURIComponent(smtp.username), pass: decodeURIComponent(smtp.password) } } : {}),
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  try {
    await transport.sendMail({ from: process.env.MAIL_FROM, to, subject, text });
    return true;
  } catch {
    console.error('[Email] Delivery failed');
    return false;
  } finally {
    transport.close();
  }
}
