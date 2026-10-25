import SessionSettings from '../components/SessionSettings';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authenticatedFetch, api } from '../lib/api';
import { useAppState } from '../lib/store';

export default function SettingsPage() {
  const { state, actions } = useAppState();
  const client=state.currentOrg?.role==='client';
  const [name,setName] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [failed,setFailed] = useState(false);
  useEffect(() => {setName(state.currentOrg?.name || '');},[state.currentOrg?.id,state.currentOrg?.name]);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(''); setFailed(false);
    try {
      const response = await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/organizations/current`, {
        method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name.trim()})
      });
      if (!response.ok) throw new Error('save failed');
      const fresh = await api.getCurrentOrganization();
      if (fresh.success) actions.setCurrentOrg(fresh.data);
      setMessage('تنظیمات ذخیره شد.');
    } catch {setFailed(true); setMessage('ذخیره انجام نشد. دسترسی و اتصال را بررسی کنید.');}
    finally {setBusy(false);}
  }
  return <section dir="rtl" className="space-y-6 text-slate-300">
    <h1 className="text-2xl text-white font-bold">{client?'تنظیمات حساب':'تنظیمات سازمان'}</h1>
    {!client && <form onSubmit={save} className="bg-surface-2 rounded-xl p-5 space-y-4">
      <label className="block">نام سازمان
        <input required maxLength={255} value={name} onChange={e=>setName(e.target.value)} className="block w-full bg-surface p-3 rounded mt-2" />
      </label>
      <p>شناسهٔ سازمان: <span dir="ltr">{state.currentOrg?.slug}</span></p>
      <button disabled={busy} className="bg-brand-600 text-white p-3 rounded disabled:opacity-50">{busy?'در حال ذخیره…':'ذخیره تنظیمات'}</button>
      {message && <p role={failed?'alert':'status'}>{message}</p>}
    </form>}
    <SessionSettings />
    {!client && <nav className="flex flex-wrap gap-4" aria-label="تنظیمات بیشتر">
      <Link to="/team" className="text-brand-400">مدیریت تیم</Link>
      <Link to="/api" className="text-brand-400">کلیدهای API و وب‌هوک‌ها</Link>
      <Link to="/billing" className="text-brand-400">اشتراک و صورتحساب</Link>
      <Link to="/integrations" className="text-brand-400">اتصال سرویس‌ها</Link>
    </nav>}
    <p className="text-sm text-slate-400">نشست‌ها پس از خروج باطل می‌شوند. ورود دومرحله‌ای در این نسخه ارائه نمی‌شود.</p>
  </section>;
}
