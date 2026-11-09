import SessionSettings from '../components/SessionSettings';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authenticatedFetch, api } from '../lib/api';
import { useAppState } from '../lib/store';
import { useAppConfig } from '../lib/app-config';

export default function SettingsPage() {
  const { state, actions } = useAppState();
  const client=state.currentOrg?.role==='client';
  const appConfig=useAppConfig();
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
    {!client && <form onSubmit={save} className="bg-surface-2 border border-surface-3/50 rounded-xl p-5 space-y-4">
      <label className="block text-sm">نام سازمان
        <input required maxLength={255} value={name} onChange={e=>setName(e.target.value)} className="block w-full max-w-xl bg-surface border border-surface-3/50 px-3 py-2.5 rounded-lg mt-1.5 text-sm text-white focus:outline-none focus:border-brand-600/50" />
      </label>
      <button disabled={busy} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50">{busy?'در حال ذخیره…':'ذخیره تنظیمات'}</button>
      {message && <p role={failed?'alert':'status'}>{message}</p>}
    </form>}
    <SessionSettings />
    {!client && <nav className="flex flex-wrap gap-4" aria-label="تنظیمات بیشتر">
      <Link to="/team" className="text-brand-400">مدیریت تیم</Link>
      <Link to="/api" className="text-brand-400">کلیدهای API و وب‌هوک‌ها</Link>
      {appConfig?.billing && <Link to="/billing" className="text-brand-400">اشتراک و صورتحساب</Link>}
      <Link to="/integrations" className="text-brand-400">اتصال سرویس‌ها</Link>
    </nav>}
    
  </section>;
}
