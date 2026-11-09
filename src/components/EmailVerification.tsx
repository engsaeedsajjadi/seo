import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/** Landing page of the link in the verification email. */
export function VerifyEmailPage({ token }: { token: string }) {
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  useEffect(() => {
    api.verifyEmail(token).then((result) => setState(result.success ? 'done' : 'failed'));
  }, [token]);
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6" dir="rtl">
      <div className="bg-surface-2 rounded-xl p-6 w-full max-w-md text-slate-300 space-y-4">
        <h1 className="text-white text-lg font-bold">تأیید ایمیل</h1>
        <p role="status">
          {state === 'working' && 'در حال تأیید…'}
          {state === 'done' && 'ایمیل شما تأیید شد.'}
          {state === 'failed' && 'این لینک معتبر نیست یا منقضی شده است. از داخل برنامه لینک تازه بگیرید.'}
        </p>
        <a className="text-brand-400 block" href="#/" onClick={() => { window.location.hash = ''; window.location.reload(); }}>ورود به داشبورد</a>
      </div>
    </div>
  );
}

/** Shown until the address is confirmed: billable actions stay blocked until then. */
export function VerifyEmailBanner({ visible }: { visible: boolean }) {
  const [sent, setSent] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  if (!visible) return null;
  async function resend() {
    setSent('sending');
    const result = await api.resendVerification();
    setSent(result.success ? 'sent' : 'failed');
  }
  return (
    <div role="status" className="mb-4 p-3 rounded-lg bg-accent-yellow/10 border border-accent-yellow/30 text-sm text-slate-200 flex flex-wrap items-center gap-3">
      <span>برای بررسی سایت، ایمیل خود را تأیید کنید.</span>
      {sent === 'sent' && <span className="text-slate-400">لینک تازه ارسال شد.</span>}
      {sent === 'failed' && <span className="text-accent-red">ارسال انجام نشد. کمی بعد دوباره تلاش کنید.</span>}
      {sent !== 'sent' && <button onClick={resend} disabled={sent === 'sending'} className="text-brand-400 hover:underline">ارسال دوبارهٔ لینک</button>}
    </div>
  );
}
