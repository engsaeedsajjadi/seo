import { useEffect, useState, type FormEvent } from 'react';
import { authenticatedFetch, clearAuthToken } from '../lib/api';
interface Session {id:string;createdAt:string;current:boolean}
export default function SessionSettings() {
  const [sessions,setSessions]=useState<Session[]>([]);
  const [message,setMessage]=useState('');
  const [currentPassword,setCurrentPassword]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const base=import.meta.env.VITE_API_URL || '';
  useEffect(()=>{
    let active=true;
    authenticatedFetch(`${base}/api/v1/auth/sessions`).then(async response=>{
      if (!response.ok) throw new Error();
      const json=await response.json(); if(active) setSessions(json.data);
    }).catch(()=>{if(active)setMessage('دریافت نشست‌ها انجام نشد.');});
    return ()=>{active=false;};
  },[base]);
  async function revoke(id:string) {
    setBusy(true);setMessage('');
    try {
      const response=await authenticatedFetch(`${base}/api/v1/auth/sessions/${encodeURIComponent(id)}`,{method:'DELETE'});
      if(!response.ok)throw new Error();
      setSessions(previous=>previous.filter(s=>s.id!==id));setMessage('نشست باطل شد.');
    } catch {setMessage('ابطال نشست انجام نشد.');} finally {setBusy(false);}
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
    <p role="status">{message}</p>
    {sessions.map(session=><div key={session.id} className="flex justify-between gap-3">
      <span>{new Date(session.createdAt).toLocaleString('fa-IR')} {session.current?'(نشست فعلی)':''}</span>
      {!session.current && <button disabled={busy} onClick={()=>revoke(session.id)} className="text-red-400">ابطال نشست</button>}
    </div>)}
    <form onSubmit={changePassword} className="space-y-3 border-t border-surface-3 pt-4">
      <label className="block">رمز فعلی<input required type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} className="block bg-surface rounded p-2" /></label>
      <label className="block">رمز جدید (حداقل ۱۲ نویسه)<input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} className="block bg-surface rounded p-2" /></label>
      <p className="text-sm">با تغییر رمز، همهٔ نشست‌ها بسته می‌شوند و باید دوباره وارد شوید.</p>
      <button disabled={busy} className="bg-brand-600 p-3 rounded text-white disabled:opacity-50">تغییر رمز</button>
    </form>
  </div>;
}
