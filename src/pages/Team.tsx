import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Users } from 'lucide-react';
import { api, authenticatedFetch } from '../lib/api';
import { useAppState } from '../lib/store';
import type { OrganizationMember } from '../lib/types';
import { toPersianDigits } from '../lib/persian';

const roles = [
  ['Viewer','مشاهده‌گر'],['Client','مشتری'],['Editor','ویراستار'],['Analyst','تحلیلگر'],
  ['SEO_Manager','مدیر سئو'],['Manager','مدیر پروژه'],['Admin','مدیر سازمان'],
];
const labels: Record<string,string> = Object.fromEntries([...roles.map(([key,value]) => [key.toLowerCase(),value]),['owner','مالک']]);
export default function Team() {
  const {state}=useAppState();
  const [client,setClient]=useState('');
  const [project,setProject]=useState('');
  const [members,setMembers] = useState<OrganizationMember[]>([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [email,setEmail] = useState('');
  const [role,setRole] = useState('Viewer');
  const load = useCallback(async () => {
    setLoading(true);
    const result = await api.getMembers();
    if (result.success) setMembers(result.data);
    else setError('دریافت اعضای تیم ناموفق بود. دوباره تلاش کنید.');
    setLoading(false);
  },[]);
  useEffect(() => { void load(); },[load]);
  async function add(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const result = await api.addMember(email.trim(),role);
    if (result.success) { setEmail(''); setNotice('عضو به سازمان اضافه شد.'); await load(); }
    else setError(result.error.status === 404 ? 'این شخص ابتدا باید حساب کاربری بسازد.' :
      result.error.status === 409 ? 'این کاربر قبلاً عضو سازمان است.' :
      result.error.code === 'LIMIT_REACHED' ? 'ظرفیت اعضای پلن تکمیل است.' : 'افزودن عضو مجاز نیست یا انجام نشد.');
    setBusy(false);
  }
  async function assignment(method:'PUT'|'DELETE') {
    setBusy(true);setError('');setNotice('');
    try {
      const response=await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(project)}/clients/${encodeURIComponent(client)}`,{method});
      if(!response.ok)throw new Error();
      setNotice(method==='PUT'?'دسترسی پروژه برای مشتری ثبت شد.':'دسترسی پروژه لغو شد.');
    } catch {setError('تغییر دسترسی انجام نشد. نقش، پروژه و عضویت را بررسی کنید.');} finally {setBusy(false);}
  }
  return <section dir="rtl" className="space-y-6">
    <h1 className="text-2xl font-bold text-white flex gap-2"><Users /> مدیریت تیم</h1>
    <p className="text-slate-400">مالک و مدیر سازمان می‌توانند کاربران دارای حساب را تا سقف پلن اضافه کنند.</p>
    {error && <p role="alert" className="text-red-400">{error}</p>}
    {notice && <p role="status" className="text-green-400">{notice}</p>}
    <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_180px_auto] items-end gap-3 bg-surface-2 border border-surface-3/50 rounded-xl p-5">
      <label className="text-sm text-slate-300">ایمیل عضو
        <input type="email" dir="ltr" required value={email} onChange={e=>setEmail(e.target.value)} className="block w-full mt-1.5 bg-surface border border-surface-3/50 rounded-lg px-3 py-2.5 text-sm text-white text-right focus:outline-none focus:border-brand-600/50" />
      </label>
      <label className="text-sm text-slate-300">نقش
        <select value={role} onChange={e=>setRole(e.target.value)} className="block w-full mt-1.5 bg-surface border border-surface-3/50 rounded-lg px-3 py-2.5 text-sm text-white">
          {roles.map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <button disabled={busy} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg px-4 py-2.5 disabled:opacity-50">{busy?'در حال ثبت…':'افزودن عضو'}</button>
    </form>
    <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5 text-slate-300 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <h2 className="sm:col-span-2 text-sm font-semibold text-white">دسترسی پروژه برای مشتری</h2>
      <label className="text-sm">مشتری<select aria-label="انتخاب مشتری" value={client} onChange={e=>setClient(e.target.value)} className="block w-full mt-1.5 bg-surface border border-surface-3/50 rounded-lg px-3 py-2.5 text-sm text-white">
        <option value="">انتخاب کنید</option>{members.filter(m=>m.role==='client').map(m=><option key={m.userId} value={m.userId}>{m.name}</option>)}
      </select></label>
      <label className="text-sm">پروژه<select aria-label="انتخاب پروژه" value={project} onChange={e=>setProject(e.target.value)} className="block w-full mt-1.5 bg-surface border border-surface-3/50 rounded-lg px-3 py-2.5 text-sm text-white">
        <option value="">انتخاب کنید</option>{state.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      <div className="sm:col-span-2 flex flex-wrap gap-3"><button disabled={!client||!project||busy} onClick={()=>assignment('PUT')} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50">ثبت دسترسی</button>
      <button disabled={!client||!project||busy} onClick={()=>assignment('DELETE')} className="text-red-400 text-sm px-4 py-2.5 disabled:opacity-50">لغو دسترسی</button></div>
    </div>
    <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5 text-slate-300">
      {loading ? <p role="status">در حال دریافت اعضا…</p> : <>
        <h2 className="mb-4 text-sm font-semibold text-white">اعضا ({toPersianDigits(members.length)})</h2>
        {members.map(member=><div key={member.id} className="flex justify-between border-b border-surface-3 py-3">
          <div><p>{member.name}</p><p dir="ltr" className="text-sm text-slate-400 text-right">{member.email}</p></div>
          <span>{labels[member.role] || member.role}</span>
        </div>)}
      </>}
    </div>
  </section>;
}
