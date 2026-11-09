import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Users, Copy, Check } from 'lucide-react';
import { api, authenticatedFetch, type Invitation } from '../lib/api';
import { useAppConfig } from '../lib/app-config';
import { formatDateOnly } from '../lib/labels';
import { useAppState } from '../lib/store';
import type { OrganizationMember } from '../lib/types';
import { toPersianDigits } from '../lib/persian';

const ROLE_HELP: Record<string,string> = {
  Viewer:'فقط می‌بیند؛ چیزی را تغییر نمی‌دهد.',
  Client:'مشتری شما: فقط سایت‌هایی را می‌بیند که پایین همین صفحه به او دسترسی بدهید.',
  Editor:'محتوا و طرح مقاله می‌سازد و ویرایش می‌کند.',
  Analyst:'کلمات کلیدی، رتبه و گزارش‌ها را مدیریت می‌کند.',
  SEO_Manager:'همهٔ کارهای سئو را انجام می‌دهد، از جمله بررسی سایت و تأیید اصلاح‌ها.',
  Manager:'پروژه‌ها را می‌سازد و مدیریت می‌کند.',
  Admin:'همه‌کار، از جمله دعوت اعضا و تنظیمات.',
};
const roles = [
  ['Viewer','مشاهده‌گر'],['Client','مشتری'],['Editor','ویراستار'],['Analyst','تحلیلگر'],
  ['SEO_Manager','مدیر سئو'],['Manager','مدیر پروژه'],['Admin','مدیر سازمان'],
];
const labels: Record<string,string> = Object.fromEntries([...roles.map(([key,value]) => [key.toLowerCase(),value]),['owner','مالک']]);
export default function Team() {
  const {state}=useAppState();
  const appConfig=useAppConfig();
  const [invitations,setInvitations]=useState<Invitation[]>([]);
  const [inviteLink,setInviteLink]=useState<{email:string;url:string;emailed:boolean}|null>(null);
  const [copied,setCopied]=useState(false);
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
    const [result, invites] = await Promise.all([api.getMembers(), api.getInvitations()]);
    if (result.success) setMembers(result.data);
    else setError('دریافت اعضای تیم ناموفق بود. دوباره تلاش کنید.');
    if (invites.success) setInvitations(invites.data);
    setLoading(false);
  },[]);
  useEffect(() => { void load(); },[load]);
  async function add(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    setInviteLink(null); setCopied(false);
    const result = await api.addMember(email.trim(),role);
    if (result.success && result.data?.invited && result.data.inviteUrl) {
      setInviteLink({ email: email.trim(), url: result.data.inviteUrl, emailed: !!result.data.emailed });
      setEmail(''); await load();
    }
    else if (result.success) { setEmail(''); setNotice('عضو به سازمان اضافه شد.'); await load(); }
    else setError(result.error.status === 404 ? 'این شخص ابتدا باید حساب کاربری بسازد.' :
      result.error.status === 409 ? 'این کاربر قبلاً عضو سازمان است.' :
      result.error.code === 'LIMIT_REACHED' ? 'ظرفیت اعضای سازمان تکمیل است.' : 'افزودن عضو مجاز نیست یا انجام نشد.');
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
    <p className="text-slate-400">{appConfig?.mode === 'private'
      ? 'مالک و مدیر سازمان همکاران را با ایمیل دعوت می‌کنند. کسی که حساب ندارد یک لینک دعوت می‌گیرد و با آن حساب می‌سازد؛ ثبت‌نام عمومی بسته است.'
      : 'مالک و مدیر سازمان می‌توانند کاربران دارای حساب را تا سقف پلن اضافه کنند.'}</p>
    {inviteLink && <div role="status" className="bg-accent-green/10 border border-accent-green/30 rounded-xl p-4 text-sm text-slate-200 space-y-2">
      <p>دعوت‌نامه برای <span dir="ltr">{inviteLink.email}</span> ساخته شد{inviteLink.emailed ? ' و با ایمیل فرستاده شد' : ''}. این لینک را می‌توانید خودتان هم برایش بفرستید (اعتبار: ۷ روز):</p>
      <div className="flex items-center gap-2">
        <code dir="ltr" className="flex-1 text-xs bg-surface rounded px-2 py-1.5 break-all text-left">{inviteLink.url}</code>
        <button type="button" aria-label="کپی لینک دعوت" onClick={async()=>{ try { await navigator.clipboard.writeText(inviteLink.url); setCopied(true); } catch { /* the link stays selectable */ } }} className="p-2 rounded-lg hover:bg-surface-3/50">
          {copied ? <Check className="w-4 h-4 text-accent-green" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>}
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
      <button disabled={busy} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg px-4 py-2.5 disabled:opacity-50">{busy?'در حال ثبت…':appConfig?.mode === 'private' ? 'دعوت یا افزودن' : 'افزودن عضو'}</button>
    </form>
    <p className="text-xs text-slate-400 -mt-2"><span className="text-slate-300">این نقش:</span> {ROLE_HELP[role]}</p>
    <div className="bg-surface-2 border border-surface-3/50 rounded-xl p-5 text-slate-300 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <h2 className="sm:col-span-2 text-sm font-semibold text-white">دسترسی مشتری به سایت‌ها</h2>
      <p className="sm:col-span-2 text-xs text-slate-400">عضوی که نقش «مشتری» دارد هیچ سایتی را نمی‌بیند تا اینجا به او دسترسی بدهید. اول او را با نقش «مشتری» دعوت کنید.</p>
      <label className="text-sm">مشتری<select aria-label="انتخاب مشتری" value={client} onChange={e=>setClient(e.target.value)} className="block w-full mt-1.5 bg-surface border border-surface-3/50 rounded-lg px-3 py-2.5 text-sm text-white">
        <option value="">{members.some(m=>m.role==='client')?'انتخاب کنید':'هنوز عضوی با نقش مشتری ندارید'}</option>{members.filter(m=>m.role==='client').map(m=><option key={m.userId} value={m.userId}>{m.name}</option>)}
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
        {invitations.length > 0 && <>
          <h2 className="mt-6 mb-2 text-sm font-semibold text-white">دعوت‌های در انتظار ({toPersianDigits(invitations.length)})</h2>
          {invitations.map(inv=><div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-3 py-3">
            <div><p dir="ltr" className="text-sm text-right">{inv.email}</p><p className="text-xs text-slate-500">{labels[inv.role.toLowerCase()] || inv.role} · معتبر تا {formatDateOnly(inv.expiresAt)}</p></div>
            <button type="button" onClick={async()=>{ const r=await api.revokeInvitation(inv.id); if(r.success) await load(); else setError('لغو دعوت انجام نشد.'); }} className="text-red-400 text-sm px-3 py-1.5">لغو دعوت</button>
          </div>)}
        </>}
      </>}
    </div>
  </section>;
}
