import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {api,authenticatedFetch} from '../lib/api';
import {useAppState} from '../lib/store';
import type {Report} from '../lib/types';
import {formatPersianDate} from '../lib/persian';
const statusLabels:Record<string,string>={pending:'در صف',generating:'در حال آماده‌سازی',completed:'آماده',ready:'آماده',failed:'ناموفق'};
export default function Reports(){
  const {state}=useAppState();const projectId=state.currentProject?.id;
  const [reports,setReports]=useState<Report[]>([]);
  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [format,setFormat]=useState('json');
  const load=useCallback(async()=>{
    if(!projectId){setLoading(false);return;}
    const result=await api.getReports(projectId);
    if(result.success)setReports(result.data);else setError('دریافت گزارش‌ها انجام نشد.');
    setLoading(false);
  },[projectId]);
  useEffect(()=>{setReports([]);setLoading(true);setError('');void load();},[load]);
  const pending=reports.some(report=>report.status==='pending'||report.status==='generating');
  useEffect(()=>{if(!pending)return;const timer=window.setInterval(()=>void load(),5000);return()=>window.clearInterval(timer);},[pending,load]);
  async function generate(event:FormEvent){
    event.preventDefault();if(!projectId)return;setBusy(true);setError('');setNotice('');
    const result=await api.generateReport(projectId,'seo',format);
    if(result.success){setReports(previous=>[result.data,...previous]);setNotice('گزارش در صف آماده‌سازی قرار گرفت.');}
    else setError(result.error.code==='LIMIT_REACHED'?'سقف گزارش ماهانهٔ پلن تکمیل شده است.':'ساخت گزارش انجام نشد. دسترسی و اتصال را بررسی کنید.');
    setBusy(false);
  }
  async function download(report:Report){
    if(!projectId)return;setBusy(true);setError('');
    try{
      const outputFormat=report.format==='pdf'?'json':report.format;
      const response=await authenticatedFetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/projects/${encodeURIComponent(projectId)}/reports/${encodeURIComponent(report.id)}/download?format=${outputFormat}`);
      if(!response.ok)throw new Error();
      const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');
      link.href=url;link.download=`report-${report.id}.${outputFormat}`;document.body.appendChild(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch{setError('دریافت فایل انجام نشد. گزارش باید آماده شده باشد.');}finally{setBusy(false);}
  }
  if(!projectId)return <p>ابتدا پروژه را انتخاب کنید.</p>;
  return <section dir="rtl" className="space-y-6 text-slate-300">
    <h1 className="text-2xl font-bold text-white">گزارش‌های سئو</h1>
    <p>گزارش از داده‌های ذخیره‌شدهٔ همین پروژه تهیه می‌شود. خروجی HTML قابل چاپ است.</p>
    {error&&<p role="alert" className="text-red-400">{error}</p>}{notice&&<p role="status" className="text-green-400">{notice}</p>}
    <form onSubmit={generate} className="flex items-end gap-3 bg-surface-2 rounded-xl p-5">
      <label>قالب خروجی<select value={format} onChange={e=>setFormat(e.target.value)} className="block bg-surface p-2 rounded mt-2">
        <option value="json">JSON</option><option value="csv">CSV</option><option value="html">HTML قابل چاپ</option>
      </select></label>
      <button disabled={busy} className="bg-brand-600 text-white p-2 rounded disabled:opacity-50">ساخت گزارش</button>
      <button type="button" onClick={()=>void load()} disabled={busy} className="p-2">تازه‌سازی</button>
    </form>
    {loading?<p role="status">در حال دریافت گزارش‌ها…</p>:reports.length===0?<p>هنوز گزارشی ساخته نشده است.</p>:
      <div className="overflow-x-auto"><table className="w-full bg-surface-2 rounded-xl text-right">
        <thead><tr><th className="p-3">عنوان</th><th>قالب</th><th>وضعیت</th><th>تاریخ</th><th>دریافت</th></tr></thead>
        <tbody>{reports.map(report=><tr key={report.id} className="border-t border-surface-3">
          <td className="p-3">{report.title}</td><td>{report.format.toUpperCase()}</td><td>{statusLabels[report.status] || report.status}</td><td>{formatPersianDate(report.createdAt,{format:'short'})}</td>
          <td>{(report.status==='completed'||report.status==='ready')&&<button onClick={()=>void download(report)} disabled={busy} className="text-brand-400 p-2">دریافت فایل</button>}</td>
        </tr>)}</tbody>
      </table></div>}
  </section>;
}
