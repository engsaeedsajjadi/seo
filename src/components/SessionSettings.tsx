import { useEffect, useState, type FormEvent } from 'react';
import { authenticatedFetch, clearAuthToken } from '../lib/api';
interface Session {id:string;createdAt:string;current:boolean}
export default function SessionSettings() {
  const [sessions,setSessions]=useState<Session[]>([]);
  const [message,setMessage]=useState('');
  const [currentPassword,setCurrentPassword]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [showAll,setShowAll]=useState(false);
  const base=import.meta.env.VITE_API_URL || '';
  useEffect(()=>{
    let active=true;
    authenticatedFetch(`${base}/api/v1/auth/sessions`).then(async response=>{
      if (!response.ok) throw new Error();
      const json=await response.json(); if(active) setSessions(json.data);
    }).catch(()=>{if(active)setMessage('فهرست دستگاه‌های واردشده دریافت نشد.');});
    return ()=>{active=false;};
  },[base]);
  async function revoke(id:string) {
    setBusy(true);setMessage('');
    try {
      const response=await authenticatedFetch(`${base}/api/v1/auth/sessions/${encodeURIComponent(id)}`,{method:'DELETE'});
      if(!response.ok)throw new Error();
      setSessions(previous=>previous.filter(s=>s.id!==id));setMessage('آن دستگاه از حساب خارج شد.');
    } catch {setMessage('خروج از آن دستگاه انجام نشد.');} finally {setBusy(false);}
  }
  async function changePassword(event:FormEvent) {
    event.preventDefault();setBusy(true);setMessage('');
    try {
      const response=await authenticatedFetch(`${base}/api/v1/auth/password`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword,password})});
      if(!response.ok)throw new Error();
      clearAuthToken();window.location.reload();
    } catch {setMessage('تغییر رمز انجام نشد. رمز فعلی و اتصال را بررسی کنید.');setBusy(false);}
  }
  return <div className="bg-surface-2 rounded-xl p-5 space-y-4">
    <h2 className="text-white font-bold">امنیت حساب</h2>
    <p className="text-sm text-slate-400">دستگاه‌هایی که الان با این حساب وارد شده‌اند:</p>
    {message && <p role="status" className="text-sm text-accent-yellow">{message}</p>}
    {(showAll?sessions:sessions.slice(0,4)).map(session=><div key={session.id} className="flex justify-between items-center gap-3 text-sm text-slate-300 border-b border-surface-3/30 pb-2">
      <span>ورود در {new Date(session.createdAt).toLocaleString('fa-IR',{dateStyle:'medium',timeStyle:'short'})} {session.current?'(همین دستگاه)':''}</span>
      {!session.current && <button disabled={busy} onClick={()=>revoke(session.id)} className="text-red-400 text-xs px-2 py-1 rounded hover:bg-surface-3/40">خروج از این دستگاه</button>}
    </div>)}
    {sessions.length>4 && <button type="button" onClick={()=>setShowAll(v=>!v)} className="text-xs text-brand-400">{showAll?'نمایش کمتر':`نمایش همه (${sessions.length.toLocaleString('fa-IR')} ورود)`}</button>}
    <form onSubmit={changePassword} className="space-y-3 border-t border-surface-3 pt-4 max-w-md">
      <h3 className="text-sm font-semibold text-white">تغییر رمز عبور</h3>
      <label className="block text-sm text-slate-300">رمز فعلی<input required type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} dir="ltr" className="block w-full mt-1.5 bg-surface border border-surface-3/50 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-600/50" /></label>
      <label className="block text-sm text-slate-300">رمز جدید (حداقل ۱۲ نویسه)<input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} dir="ltr" className="block w-full mt-1.5 bg-surface border border-surface-3/50 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-600/50" /></label>
      <p className="text-xs text-slate-400">با تغییر رمز، همهٔ دستگاه‌ها از حساب خارج می‌شوند و باید دوباره وارد شوید.</p>
      <button disabled={busy} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50">تغییر رمز</button>
    </form>
  </div>;
}
