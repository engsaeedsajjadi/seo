import assert from 'node:assert/strict';
const storage = new Map<string,string>();
(globalThis as any).localStorage={getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)};
const events = new EventTarget();
(globalThis as any).window=Object.assign(events,{location:{origin:'http://localhost:3000'}});
const {ApiClient,api,setAuthToken,clearAuthToken,getAuthToken,authenticatedFetch,AUTH_EXPIRED_EVENT}=await import('../../src/lib/api.ts');
const originalFetch=globalThis.fetch;
let checks=0;
function check(value:unknown,message:string){assert.ok(value,message);checks++;}
const ok=(data:unknown)=>new Response(JSON.stringify({success:true,data}),{status:200,headers:{'Content-Type':'application/json'}});
try {
  const requests:Array<{url:string;auth:string|null}>=[];
  globalThis.fetch=async(input:any,options:any)=>{
    requests.push({url:String(input),auth:new Headers(options?.headers).get('Authorization')});
    return ok({id:'test'});
  };
  const client=new ApiClient('');
  check(await client.checkAvailability(),'empty API origin supports same-origin health');
  setAuthToken('stored-token');
  check((await client.getCurrentUser()).success,'same-origin authenticated request succeeds');
  check(requests.at(-1)?.auth==='Bearer stored-token','typed client attaches bearer token');
  await authenticatedFetch('/api/v1/api-keys');
  check(requests.at(-1)?.auth==='Bearer stored-token','raw response transport attaches bearer token');
  await assert.rejects(()=>authenticatedFetch('https://untrusted.test/api/v1/users'));
  checks++;
  globalThis.fetch=async()=>ok({report:{id:'persisted-report',status:'pending'},job:{id:'queued-job'}});
  const report=await api.generateReport('project','seo','json');
  check(report.success && report.data.id==='persisted-report','report client unwraps the persisted report instead of treating the job envelope as a report');
  let refreshes=0;
  globalThis.fetch=async(input:any,options:any)=>{
    if(String(input).endsWith('/auth/refresh')) { refreshes++;await new Promise(r=>setTimeout(r,5));return ok({token:'rotated-token'}); }
    return new Headers(options.headers).get('Authorization')==='Bearer rotated-token' ? ok({id:'test'}) : new Response(JSON.stringify({error:{code:'SESSION_EXPIRED'}}),{status:401});
  };
  setAuthToken('expired-token');
  const results=await Promise.all([api.getCurrentUser(),authenticatedFetch('/api/v1/api-keys')]);
  check((results[0] as any).success && (results[1] as Response).ok,'both transports retry after refresh');
  check(refreshes===1,'concurrent refresh uses single-flight across transports');
  check(getAuthToken()==='rotated-token','rotated access token persisted');
  let expired=false;
  window.addEventListener(AUTH_EXPIRED_EVENT,()=>{expired=true;});
  globalThis.fetch=async()=>new Response(JSON.stringify({error:{code:'SESSION_EXPIRED'}}),{status:401});
  check(!(await api.getCurrentUser()).success,'failed refresh returns authentication error');
  check(expired && getAuthToken()===null,'failed refresh clears session and notifies React');
  console.log(`PASS: ${checks} frontend auth assertions`);
} finally {globalThis.fetch=originalFetch;clearAuthToken();}
