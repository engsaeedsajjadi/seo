import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
export default function PasswordRecovery({token,onBack}:{token?:string;onBack:()=>void}) {
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const [error,setError]=useState('');
  async function submit(event:FormEvent) {
    event.preventDefault();setBusy(true);setError('');
    const result=token ? await api.resetPassword(token,password) : await api.requestPasswordReset(email.trim());
    if(result.success)setDone(true);
    else setError(result.error.status===503 ? 'ارسال ایمیل فعلاً در دسترس نیست. با پشتیبانی تماس بگیرید.' : token ? 'لینک نامعتبر یا منقضی است. دوباره درخواست بازیابی کنید.' : 'درخواست انجام نشد. ایمیل و اتصال را بررسی کنید.');
    setBusy(false);
  }
  return <div dir="rtl" className="space-y-4 text-slate-300">
    <h2 className="text-white text-lg font-bold">بازیابی رمز عبور</h2>
    {done ? <p role="status">{token?'رمز تغییر کرد. با رمز جدید وارد شوید.':'اگر این ایمیل حساب داشته باشد، لینک بازیابی برای آن ارسال خواهد شد.'}</p> :
      <form onSubmit={submit} className="space-y-4">
        {token ? <label className="block">رمز جدید (حداقل ۱۲ نویسه)<input autoComplete="new-password" required type="password" minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} className="block w-full bg-surface p-3 rounded mt-2" /></label> :
          <label className="block">ایمیل حساب<input autoComplete="email" required type="email" dir="ltr" value={email} onChange={e=>setEmail(e.target.value)} className="block w-full bg-surface p-3 rounded mt-2" /></label>}
        {error && <p role="alert" className="text-red-400">{error}</p>}
        <button disabled={busy} className="bg-brand-600 p-3 rounded text-white disabled:opacity-50">{busy?'در حال پردازش…':token?'ثبت رمز جدید':'ارسال لینک بازیابی'}</button>
      </form>}
    <button type="button" onClick={onBack} className="block text-brand-400">بازگشت به ورود</button>
  </div>;
}
