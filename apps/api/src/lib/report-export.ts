const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]!));
function flatten(value:unknown,path='',rows:string[][]=[]):string[][] {
  if(value!==null && typeof value==='object'){
    for(const [key,child] of Object.entries(value))flatten(child,path?`${path}.${key}`:key,rows);
  }else rows.push([path,value===null?'':String(value)]);
  return rows;
}
export function exportReport(snapshot:unknown,format:'json'|'csv'|'html') {
  if(format==='json')return {contentType:'application/json; charset=utf-8',body:JSON.stringify(snapshot,null,2)};
  const rows=flatten(snapshot);
  if(format==='csv'){
    const cell=(value:string)=>`"${(/^[=+@-]/.test(value.trimStart())?"'"+value:value).replace(/"/g,'""')}"`;
    return {contentType:'text/csv; charset=utf-8',body:'\uFEFF'+[['field','value'],...rows].map(row=>row.map(cell).join(',')).join('\r\n')};
  }
  return {contentType:'text/html; charset=utf-8',body:`<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>گزارش سئو</title><style>body{font-family:Tahoma,sans-serif;max-width:1000px;margin:40px auto;padding:24px;color:#172033}h1{border-bottom:3px solid #2563eb;padding-bottom:20px}table{width:100%;border-collapse:collapse;direction:ltr}td{border:1px solid #dde3ed;padding:10px;overflow-wrap:anywhere}tr:nth-child(even){background:#f5f7fb}@media print{body{margin:0;padding:0}}</style><h1>گزارش سئو</h1><table>${rows.map(row=>'<tr>'+row.map(value=>`<td>${escapeHtml(value)}</td>`).join('')+'</tr>').join('')}</table></html>`};
}
