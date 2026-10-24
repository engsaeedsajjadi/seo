/**
 * Email Service - Persian Templates
 * All emails are in Persian (fa-IR) with RTL support
 */

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export const emailTemplates = {
  welcome: (name: string, orgName: string): EmailTemplate => ({
    subject: `به رنک‌فورج خوش آمدید، ${name}!`,
    html: `
      <div dir="rtl" lang="fa" style="font-family: Vazirmatn, Tahoma, sans-serif; direction: rtl; text-align: right; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0f172a; color: #ffffff;">
        <div style="background: linear-gradient(to bottom right, #3b82f6, #1d4ed8); padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
          <h1 style="margin: 0; font-size: 24px; font-weight: bold;">رنک‌فورج</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">پلتفرم جامع اتوماسیون سئو</p>
        </div>
        <h2 style="color: #ffffff; font-size: 20px;">سلام ${name} عزیز!</h2>
        <p style="color: #94a3b8; line-height: 1.8;">به رنک‌فورج خوش آمدید. حساب کاربری شما با موفقیت ایجاد شد و سازمان <strong style="color: #60a5fa;">${orgName}</strong> برای شما ساخته شد.</p>
        <p style="color: #94a3b8; line-height: 1.8;">برای شروع کار:</p>
        <ol style="color: #94a3b8; line-height: 1.8; padding-right: 20px;">
          <li>اولین پروژه خود را ایجاد کنید</li>
          <li>دامنه وب‌سایت خود را اضافه کنید</li>
          <li>ممیزی سئو را اجرا کنید</li>
          <li>کلمات کلیدی خود را اضافه و رتبه‌ها را ردیابی کنید</li>
        </ol>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.APP_URL || 'https://rankforge.io'}" style="background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 500;">ورود به داشبورد</a>
        </div>
        <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 30px;">این ایمیل به صورت خودکار ارسال شده است. لطفاً پاسخ ندهید.</p>
      </div>
    `,
    text: `سلام ${name} عزیز!\n\nبه رنک‌فورج خوش آمدید. حساب کاربری شما با موفقیت ایجاد شد و سازمان ${orgName} برای شما ساخته شد.\n\nبرای شروع: اولین پروژه خود را ایجاد کنید و ممیزی سئو را اجرا کنید.\n\nورود به داشبورد: ${process.env.APP_URL || 'https://rankforge.io'}`,
  }),

  emailVerification: (name: string, code: string): EmailTemplate => ({
    subject: 'کد تأیید ایمیل - رنک‌فورج',
    html: `
      <div dir="rtl" lang="fa" style="font-family: Vazirmatn, Tahoma, sans-serif; direction: rtl; text-align: right; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0f172a; color: #ffffff;">
        <h2 style="color: #ffffff;">تأیید ایمیل</h2>
        <p style="color: #94a3b8;">سلام ${name} عزیز،</p>
        <p style="color: #94a3b8;">کد تأیید ایمیل شما:</p>
        <div style="background-color: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #60a5fa;">${code}</div>
        <p style="color: #94a3b8; font-size: 14px;">این کد تا ۱۰ دقیقه معتبر است.</p>
        <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 30px;">اگر شما این درخواست را نکرده‌اید، این ایمیل را نادیده بگیرید.</p>
      </div>
    `,
    text: `سلام ${name} عزیز،\n\nکد تأیید ایمیل شما: ${code}\n\nاین کد تا ۱۰ دقیقه معتبر است.`,
  }),

  passwordReset: (name: string, resetLink: string): EmailTemplate => ({
    subject: 'بازنشانی رمز عبور - رنک‌فورج',
    html: `
      <div dir="rtl" lang="fa" style="font-family: Vazirmatn, Tahoma, sans-serif; direction: rtl; text-align: right; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0f172a; color: #ffffff;">
        <h2 style="color: #ffffff;">بازنشانی رمز عبور</h2>
        <p style="color: #94a3b8;">سلام ${name} عزیز،</p>
        <p style="color: #94a3b8;">درخواست بازنشانی رمز عبور برای حساب شما دریافت شد. برای تنظیم رمز عبور جدید روی لینک زیر کلیک کنید:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 500;">بازنشانی رمز عبور</a>
        </div>
        <p style="color: #94a3b8; font-size: 14px;">این لینک تا ۱ ساعت معتبر است.</p>
        <p style="color: #94a3b8; font-size: 14px;">اگر شما این درخواست را نکرده‌اید، این ایمیل را نادیده بگیرید و رمز عبور شما تغییر نخواهد کرد.</p>
        <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 30px;">لینک: ${resetLink}</p>
      </div>
    `,
    text: `سلام ${name} عزیز،\n\nدرخواست بازنشانی رمز عبور دریافت شد.\n\nلینک بازنشانی: ${resetLink}\n\nاین لینک تا ۱ ساعت معتبر است.`,
  }),

  teamInvite: (inviterName: string, orgName: string, inviteLink: string, role: string): EmailTemplate => {
    const rolePersian: Record<string, string> = {
      owner: 'مالک',
      admin: 'مدیر',
      member: 'عضو',
      viewer: 'مشاهده‌گر',
      client: 'مشتری',
    };
    return {
      subject: `دعوت به تیم ${orgName} - رنک‌فورج`,
      html: `
        <div dir="rtl" lang="fa" style="font-family: Vazirmatn, Tahoma, sans-serif; direction: rtl; text-align: right; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0f172a; color: #ffffff;">
          <h2 style="color: #ffffff;">دعوت به تیم</h2>
          <p style="color: #94a3b8;">سلام،</p>
          <p style="color: #94a3b8;"><strong style="color: #ffffff;">${inviterName}</strong> شما را به تیم <strong style="color: #60a5fa;">${orgName}</strong> با نقش <strong style="color: #10b981;">${rolePersian[role] || role}</strong> دعوت کرده است.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 500;">پذیرش دعوت</a>
          </div>
          <p style="color: #94a3b8; font-size: 14px;">این دعوت تا ۷ روز معتبر است.</p>
        </div>
      `,
      text: `سلام،\n\n${inviterName} شما را به تیم ${orgName} با نقش ${rolePersian[role] || role} دعوت کرده است.\n\nپذیرش دعوت: ${inviteLink}\n\nاین دعوت تا ۷ روز معتبر است.`,
    };
  },

  crawlCompleted: (projectName: string, pagesCount: number, issuesCount: number): EmailTemplate => ({
    subject: `خزش ${projectName} تکمیل شد - رنک‌فورج`,
    html: `
      <div dir="rtl" lang="fa" style="font-family: Vazirmatn, Tahoma, sans-serif; direction: rtl; text-align: right; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0f172a; color: #ffffff;">
        <h2 style="color: #ffffff;">خزش تکمیل شد</h2>
        <p style="color: #94a3b8;">خزش پروژه <strong style="color: #60a5fa;">${projectName}</strong> با موفقیت تکمیل شد.</p>
        <div style="background-color: #1e293b; border-radius: 8px; padding: 15px; margin: 20px 0;">
          <p style="margin: 5px 0; color: #94a3b8;">📄 صفحات خزش شده: <strong style="color: #ffffff;">${pagesCount.toLocaleString('fa-IR')}</strong></p>
          <p style="margin: 5px 0; color: #94a3b8;">⚠️ مشکلات یافت شده: <strong style="color: #f59e0b;">${issuesCount.toLocaleString('fa-IR')}</strong></p>
        </div>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${process.env.APP_URL || 'https://rankforge.io'}" style="background-color: #2563eb; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; display: inline-block;">مشاهده نتایج</a>
        </div>
      </div>
    `,
    text: `خزش پروژه ${projectName} تکمیل شد.\n\nصفحات خزش شده: ${pagesCount}\nمشکلات یافت شده: ${issuesCount}\n\nمشاهده نتایج: ${process.env.APP_URL || 'https://rankforge.io'}`,
  }),

  auditCompleted: (projectName: string, score: number, criticalIssues: number): EmailTemplate => ({
    subject: `ممیزی ${projectName} تکمیل شد - امتیاز ${score} - رنک‌فورج`,
    html: `
      <div dir="rtl" lang="fa" style="font-family: Vazirmatn, Tahoma, sans-serif; direction: rtl; text-align: right; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0f172a; color: #ffffff;">
        <h2 style="color: #ffffff;">ممیزی تکمیل شد</h2>
        <p style="color: #94a3b8;">ممیزی پروژه <strong style="color: #60a5fa;">${projectName}</strong> با موفقیت انجام شد.</p>
        <div style="background: linear-gradient(to bottom right, #3b82f6, #1d4ed8); border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
          <p style="margin: 0; color: #bfdbfe; font-size: 14px;">امتیاز سئو</p>
          <p style="margin: 10px 0 0 0; font-size: 48px; font-weight: bold; color: #ffffff;">${score.toLocaleString('fa-IR')}</p>
          <p style="margin: 5px 0 0 0; color: #bfdbfe; font-size: 14px;">از ۱۰۰</p>
        </div>
        <p style="color: #94a3b8;">مشکلات بحرانی: <strong style="color: #ef4444;">${criticalIssues.toLocaleString('fa-IR')}</strong></p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${process.env.APP_URL || 'https://rankforge.io'}" style="background-color: #2563eb; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; display: inline-block;">مشاهده جزئیات ممیزی</a>
        </div>
      </div>
    `,
    text: `ممیزی پروژه ${projectName} تکمیل شد.\n\nامتیاز سئو: ${score} از ۱۰۰\nمشکلات بحرانی: ${criticalIssues}\n\nمشاهده جزئیات: ${process.env.APP_URL || 'https://rankforge.io'}`,
  }),

  rankingAlert: (keyword: string, oldPosition: number, newPosition: number, projectName: string): EmailTemplate => {
    const improved = newPosition < oldPosition;
    return {
      subject: `${improved ? '📈 بهبود' : '📉 افت'} رتبه "${keyword}" - رنک‌فورج`,
      html: `
        <div dir="rtl" lang="fa" style="font-family: Vazirmatn, Tahoma, sans-serif; direction: rtl; text-align: right; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0f172a; color: #ffffff;">
          <h2 style="color: #ffffff;">${improved ? 'بهبود رتبه' : 'افت رتبه'}</h2>
          <p style="color: #94a3b8;">رتبه کلمه کلیدی <strong style="color: #60a5fa;">${keyword}</strong> در پروژه ${projectName} تغییر کرد:</p>
          <div style="background-color: #1e293b; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; color: #94a3b8;">از جایگاه <strong style="color: #ffffff;">${oldPosition.toLocaleString('fa-IR')}</strong> به <strong style="color: ${improved ? '#10b981' : '#ef4444'};">${newPosition.toLocaleString('fa-IR')}</strong></p>
            <p style="margin: 10px 0 0 0; color: ${improved ? '#10b981' : '#ef4444'}; font-weight: bold;">${improved ? `📈 ${Math.abs(newPosition - oldPosition).toLocaleString('fa-IR')} پله صعود` : `📉 ${Math.abs(newPosition - oldPosition).toLocaleString('fa-IR')} پله نزول`}</p>
          </div>
        </div>
      `,
      text: `${improved ? 'بهبود' : 'افت'} رتبه کلمه "${keyword}"\n\nاز جایگاه ${oldPosition} به ${newPosition}\n\n${improved ? `صعود ${Math.abs(newPosition - oldPosition)} پله` : `نزول ${Math.abs(newPosition - oldPosition)} پله`}`,
    };
  },

  reportReady: (reportName: string, projectName: string, downloadLink: string): EmailTemplate => ({
    subject: `گزارش ${reportName} آماده شد - رنک‌فورج`,
    html: `
      <div dir="rtl" lang="fa" style="font-family: Vazirmatn, Tahoma, sans-serif; direction: rtl; text-align: right; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0f172a; color: #ffffff;">
        <h2 style="color: #ffffff;">گزارش آماده شد</h2>
        <p style="color: #94a3b8;">گزارش <strong style="color: #60a5fa;">${reportName}</strong> برای پروژه ${projectName} آماده است.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${downloadLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 500;">دانلود گزارش</a>
        </div>
      </div>
    `,
    text: `گزارش ${reportName} برای پروژه ${projectName} آماده است.\n\nدانلود: ${downloadLink}`,
  }),

  billingAlert: (amount: string, dueDate: string): EmailTemplate => ({
    subject: 'صورتحساب جدید - رنک‌فورج',
    html: `
      <div dir="rtl" lang="fa" style="font-family: Vazirmatn, Tahoma, sans-serif; direction: rtl; text-align: right; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0f172a; color: #ffffff;">
        <h2 style="color: #ffffff;">صورتحساب جدید</h2>
        <p style="color: #94a3b8;">صورتحساب جدیدی به مبلغ <strong style="color: #ffffff;">${amount}</strong> برای شما صادر شد.</p>
        <p style="color: #94a3b8;">تاریخ سررسید: ${dueDate}</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.APP_URL || 'https://rankforge.io'}/billing" style="background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 500;">مشاهده صورتحساب</a>
        </div>
      </div>
    `,
    text: `صورتحساب جدید به مبلغ ${amount} صادر شد.\n\nتاریخ سررسید: ${dueDate}\n\nمشاهده: ${process.env.APP_URL || 'https://rankforge.io'}/billing`,
  }),

  lowCreditsWarning: (balance: number): EmailTemplate => ({
    subject: 'هشدار: اعتبار رو به پایان است - رنک‌فورج',
    html: `
      <div dir="rtl" lang="fa" style="font-family: Vazirmatn, Tahoma, sans-serif; direction: rtl; text-align: right; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0f172a; color: #ffffff;">
        <h2 style="color: #f59e0b;">⚠️ اعتبار رو به پایان است</h2>
        <p style="color: #94a3b8;">اعتبار حساب شما رو به پایان است. موجودی فعلی: <strong style="color: #f59e0b;">${balance.toLocaleString('fa-IR')}</strong> اعتبار</p>
        <p style="color: #94a3b8;">برای ادامه استفاده از خدمات، لطفاً اعتبار خود را شارژ کنید یا پلن خود را ارتقا دهید.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.APP_URL || 'https://rankforge.io'}/billing" style="background-color: #f59e0b; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: 500;">خرید اعتبار</a>
        </div>
      </div>
    `,
    text: `اعتبار حساب شما رو به پایان است. موجودی فعلی: ${balance} اعتبار\n\nبرای ادامه، اعتبار بخرید یا پلن خود را ارتقا دهید.\n\nخرید: ${process.env.APP_URL || 'https://rankforge.io'}/billing`,
  }),
};

// Helper to get template
export function getEmailTemplate(
  type: keyof typeof emailTemplates,
  ...args: any[]
): EmailTemplate {
  const templateFn = emailTemplates[type] as any;
  if (typeof templateFn === 'function') {
    return templateFn(...args);
  }
  throw new Error(`Email template ${type} not found or not a function`);
}

export default emailTemplates;
