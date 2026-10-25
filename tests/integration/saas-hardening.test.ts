/** Actual Express routes + production repositories against embedded PostgreSQL (PGlite).
 * No mocked auth/tenant logic. PGlite serializes clients; concurrency/load tests require native PG.
 */
import assert from 'node:assert/strict';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import jwt from '../../apps/api/node_modules/jsonwebtoken/index.js';

process.env.JWT_SECRET = 'integration-only-secret-not-for-production-00000000';
const nativeUrl=process.env.SAAS_TEST_DATABASE_URL;
let cleanupNative:undefined|(()=>Promise<void>);
let db:any;
if(nativeUrl){
  // A dedicated schema prevents these destructive fixtures touching application tables.
  const {Pool}=await import('pg');
  const admin=new Pool({connectionString:nativeUrl});
  const schema='saas_test_'+Date.now().toString(36);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url=new URL(nativeUrl);url.searchParams.set('options',`-c search_path=${schema},public`);
  process.env.DATABASE_URL=url.toString();
  const fixtures=new Pool({connectionString:url.toString()});
  db={exec:(sql:string)=>fixtures.query(sql),query:(sql:string,params?:unknown[])=>fixtures.query(sql,params),close:()=>fixtures.end()};
  cleanupNative=async()=>{await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();};
}else{
  process.env.DATABASE_URL='postgresql://embedded/test';
  db=new PGlite({extensions:{uuid_ossp,pgcrypto}});
}
await db.exec(readFileSync('apps/api/db/schema.sql','utf8'));
await db.exec(readFileSync('drizzle/001_tenant_rls.sql','utf8'));
await db.exec(readFileSync('drizzle/002_sessions_and_client_projects.sql','utf8'));
await db.exec(readFileSync('drizzle/003_password_recovery.sql','utf8'));
const {getPool,closePool} = await import('../../apps/api/src/db/client.ts');
if(!nativeUrl){
  const pool=getPool();
  let queue=Promise.resolve();
  (pool as any).connect=async()=>{
    let release!:()=>void;
    const previous=queue;queue=new Promise<void>(resolve=>{release=resolve;});await previous;
    return {query:async(sql:string,params?:unknown[])=>{
      const result=params?.length?await db.query(sql,params):(await db.exec(sql))[0];
      return {...result,rowCount:result.affectedRows ?? result.rows.length};
    },release};
  };
}
await db.query(`INSERT INTO plans (id,name,price_monthly_cents,price_annual_cents,limits) VALUES ('FREE','Free',0,0,'{"users":5,"projects":1}')`);
const {createApp} = await import('../../apps/api/src/app.ts');
const server = createApp().listen(0,'127.0.0.1');
await new Promise<void>(resolve=>server.once('listening',resolve));
const address = server.address() as {port:number};
const base = `http://127.0.0.1:${address.port}`;
async function request(path:string, method='GET',token?:string,body?:unknown,cookie?:string) {
  const response = await fetch(base+'/api/v1'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
  const json = await response.json();
  return {status:response.status,data:json.data,error:json.error,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
let checks = 0;
function check(condition:unknown,message:string) { assert.ok(condition,message); checks++; }
try {
  const a = await request('/auth/signup','POST',undefined,{name:'Owner A',email:'owner-a@example.test',password:'Password123!'});
  check(a.status===201,'signup persists complete account');
  const b = await request('/auth/signup','POST',undefined,{name:'Owner B',email:'owner-b@example.test',password:'Password123!'});
  check(b.status===201,'second tenant created');
  const me = await request('/auth/me','GET',a.data.token);
  check(me.status===200,'stored session authenticates');
  const org = await request('/organizations/current','GET',a.data.token);
  check(Array.isArray(org.data.members) && org.data.credits.balance===100,'organization contract includes members and credits');
  const project = await request('/projects','POST',a.data.token,{name:'Website A',domain:'example.com'});
  check(project.status===201,'project created with queued crawl');
  check((await request('/projects/'+project.data.id,'GET',b.data.token)).status===404,'cross tenant project denied');
  check((await request('/projects','POST',a.data.token,{name:'Overflow',domain:'example.org'})).status===403,'project plan limit enforced');
  await db.query(`INSERT INTO organization_members(organization_id,user_id,role) VALUES ($1,$2,'Viewer')`,[a.data.organization.id,b.data.user.id]);
  const {sessionService} = await import('../../apps/api/src/services/session.service.ts');
  const viewer = await sessionService.create(b.data.user.id,a.data.organization.id,'Owner','owner-b@example.test');
  check((await request('/organizations/current','PATCH',viewer.token,{name:'Forbidden'})).status===403,'live Viewer role overrides stale Owner JWT');
  check((await request('/projects','POST',viewer.token,{name:'Forbidden',domain:'denied.test'})).status===403,'viewer cannot mutate projects in development either');
  await db.query("UPDATE organization_members SET role='Client' WHERE organization_id=$1 AND user_id=$2",[a.data.organization.id,b.data.user.id]);
  const unassigned = await request('/client-portal/projects','GET',viewer.token);
  check(unassigned.status===200 && unassigned.data.length===0,'client sees no unassigned projects');
  check((await request('/projects/'+project.data.id,'GET',viewer.token)).status===404,'client direct URL denied before assignment');
  const assigned = await request(`/projects/${project.data.id}/clients/${b.data.user.id}`,'PUT',a.data.token);
  check(assigned.status===200,'admin can assign same-tenant client');
  check((await request('/projects/'+project.data.id,'GET',viewer.token)).status===200,'assigned client can read project');
  check((await request('/projects/'+project.data.id,'PATCH',viewer.token,{name:'No'})).status===403,'client remains read-only');
  const {callApiTool}=await import('../../apps/mcp/src/api-gateway.ts');
  await assert.rejects(()=>callApiTool('list_projects',{},'',base),(e:any)=>e.status===401);checks++;
  const mcpClient=await callApiTool('list_projects',{},`Bearer ${viewer.token}`,base) as any;
  check(mcpClient.projects.length===1,'MCP uses API client project filter');
  await assert.rejects(()=>callApiTool('run_crawl',{projectId:project.data.id},`Bearer ${viewer.token}`,base),(e:any)=>e.status===403);checks++;
  const switched = await request('/auth/organization','POST',b.data.token,{organizationId:a.data.organization.id});
  check(switched.status===200,'member can switch organizations');
  const switchedMe = await request('/auth/me','GET',switched.data.token);
  check(switchedMe.data.user.organizationId===a.data.organization.id && switchedMe.data.user.role==='Client','me reflects active session organization and role');
  check((await request('/auth/me','GET',b.data.token)).status===401,'switch revokes previous session');
  check((await request('/auth/sessions','GET',switched.data.token)).data.some((s:any)=>s.current),'session management lists current session');
  const rejectedOrigin=await fetch(base+'/api/v1/auth/refresh',{method:'POST',headers:{Origin:'https://untrusted.example',Cookie:a.cookie!}});
  check(rejectedOrigin.status===403,'cross-site refresh blocked');
  check((await request('/projects/'+project.data.id+'/clients/'+a.data.user.id,'PUT',a.data.token)).status===409,'non-client cannot be assigned as client');
  const serviceKey=await request('/api-keys','POST',a.data.token,{name:'Integration',scopes:['read']});
  check(serviceKey.status===201,'API key created with validated scopes');
  check((await request('/projects','GET',serviceKey.data.key)).status===200,'API key authenticates REST requests');
  check((await request('/projects','POST',serviceKey.data.key,{name:'No',domain:'no.test'})).status===403,'read-only key cannot write');
  check((await request('/billing/credits','GET',serviceKey.data.key)).status===403,'service key cannot manage billing');
  await request('/api-keys/'+serviceKey.data.id,'DELETE',a.data.token);
  check((await request('/projects','GET',serviceKey.data.key)).status===401,'revoked API key stops working');
  const refreshed = await request('/auth/refresh','POST',undefined,undefined,a.cookie);
  check(refreshed.status===200 && refreshed.cookie!==a.cookie,'refresh rotates HttpOnly credential');
  check((await request('/auth/refresh','POST',undefined,undefined,a.cookie)).status===401,'refresh replay rejected');
  check((await request('/auth/me','GET',refreshed.data.token)).status===401,'replay revokes entire session family');
  const signedIn = await request('/auth/login','POST',undefined,{email:'owner-a@example.test',password:'Password123!'});
  check(signedIn.status===200,'login after replay creates new session');
  check((await request('/auth/logout','POST',signedIn.data.token)).status===200,'logout succeeds');
  check((await request('/auth/me','GET',signedIn.data.token)).status===401,'logout invalidates access token server-side');
  check((await request('/auth/refresh','POST',undefined,undefined,signedIn.cookie)).status===401,'logout invalidates refresh token');
  const passwordSession=await sessionService.create(a.data.user.id,a.data.organization.id,'Owner','owner-a@example.test');
  const passwordChanged=await request('/auth/password','POST',passwordSession.token,{currentPassword:'Password123!',password:'NewPassword12345!'});
  check(passwordChanged.status===200,'password changes after current credential verification');
  check((await request('/auth/me','GET',passwordSession.token)).status===401,'password change invalidates existing sessions');
  const {authService} = await import('../../apps/api/src/services/auth.service.ts');
  await db.exec(`CREATE FUNCTION reject_test_wallet() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'wallet failure'; END $$;
    CREATE TRIGGER fail_wallet BEFORE INSERT ON credit_wallets FOR EACH ROW EXECUTE FUNCTION reject_test_wallet();`);
  await assert.rejects(()=>authService.signup('rollback@example.test','Password123!','Rollback'));
  check((await db.query("SELECT id FROM users WHERE email='rollback@example.test'")).rows.length===0,'failed signup rolls back user, org and membership');
  await db.exec('DROP TRIGGER fail_wallet ON credit_wallets');
  const messages:string[]=[];
  const mailServer=net.createServer(socket=>{
    socket.write('220 localhost ESMTP\r\n');
    let buffer='';let data=false;let message='';
    socket.on('data',chunk=>{
      buffer+=chunk.toString();
      let index:number;
      while((index=buffer.indexOf('\r\n'))>=0){
        const line=buffer.slice(0,index);buffer=buffer.slice(index+2);
        if(data){if(line==='.') {messages.push(message);data=false;message='';socket.write('250 queued\r\n');} else message+=line+'\r\n';}
        else if(/^EHLO|^HELO/.test(line))socket.write('250 localhost\r\n');
        else if(line==='DATA'){data=true;socket.write('354 enter mail\r\n');}
        else if(line==='QUIT'){socket.end('221 bye\r\n');}
        else socket.write('250 OK\r\n');
      }
    });
  }).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>mailServer.once('listening',resolve));
  process.env.SMTP_URL=`smtp://127.0.0.1:${(mailServer.address() as any).port}`;
  process.env.MAIL_FROM='sender@example.test';
  try {
    const {passwordRecoveryService}=await import('../../apps/api/src/services/password-recovery.service.ts');
    await passwordRecoveryService.request('owner-a@example.test');
    check(messages.length===1,'password recovery delivers actual SMTP message to test server');
    const [headers,...bodyParts]=messages[0].split('\r\n\r\n');
    const rawBody=bodyParts.join('\r\n\r\n');
    const decodedMessage=/Content-Transfer-Encoding: base64/i.test(headers) ? Buffer.from(rawBody.replace(/\s/g,''),'base64').toString('utf8') : rawBody.replace(/=\r\n/g,'').replace(/=3D/g,'=');
    const resetToken=/token=([a-f0-9]{64})/.exec(decodedMessage)?.[1];
    check(!!resetToken,'recovery email contains a valid opaque reset link');
    const resetSession=await sessionService.create(a.data.user.id,a.data.organization.id,'Owner','owner-a@example.test');
    await passwordRecoveryService.reset(resetToken!,'RecoveredPassword123!');
    check((await request('/auth/me','GET',resetSession.token)).status===401,'reset invalidates all existing sessions');
    await assert.rejects(()=>passwordRecoveryService.reset(resetToken!,'DifferentPassword123!'));checks++;
    await passwordRecoveryService.request('nobody@example.test');
    check(messages.length===1,'unknown email does not receive recovery mail');
  } finally {await new Promise<void>(resolve=>mailServer.close(()=>resolve()));}
  const concurrentUser=await authService.signup('concurrent@example.test','Password123!','Concurrent');
  const creations=await Promise.all([
    request('/projects','POST',concurrentUser.token,{name:'Concurrent One',domain:'one.example.test'}),
    request('/projects','POST',concurrentUser.token,{name:'Concurrent Two',domain:'two.example.test'}),
  ]);
  check(creations.filter(r=>r.status===201).length===1 && creations.filter(r=>r.status===403).length===1,'concurrent project creation cannot exceed plan limit');
  const role = (jwt as any).decode(b.data.token);
  check(!!role.sid && role.exp-role.iat===900,'access token expires after 15 minutes');
  console.log(`PASS: ${checks} SaaS integration assertions (${nativeUrl?'native PostgreSQL':'embedded PostgreSQL'})`);
} finally {
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  await closePool();
  await db.close();
  await cleanupNative?.();
}
