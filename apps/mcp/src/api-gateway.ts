/** MCP uses the API's session, role, client-assignment and billing guards. */
export async function callApiTool(tool: string, params: Record<string, unknown>, authorization: string, apiBase: string) {
  if (!authorization.startsWith('Bearer ')) throw {status:401,code:'UNAUTHENTICATED',message:'Bearer authentication required'};
  const projectId = typeof params.projectId === 'string' ? encodeURIComponent(params.projectId) : '';
  const routes: Record<string,{path:string;method?:string;key?:string;body?:unknown}> = {
    list_projects: {path:'/projects',key:'projects'},
    get_project: {path:`/projects/${projectId}`,key:'project'},
    get_audit_findings: {path:`/projects/${projectId}/audit/findings`,key:'findings'},
    get_keywords: {path:`/projects/${projectId}/keywords`,key:'keywords'},
    get_rankings: {path:`/projects/${projectId}/rankings`,key:'rankings'},
    get_competitors: {path:`/projects/${projectId}/competitors`,key:'competitors'},
    get_backlinks: {path:`/projects/${projectId}/backlinks`,key:'backlinks'},
    run_crawl: {path:`/projects/${projectId}/crawl`,method:'POST',body:{maxPages:params.maxPages || 20}},
    generate_report: {path:`/projects/${projectId}/reports`,method:'POST',body:{type:params.type || 'seo',format:params.format || 'json'}},
    get_provider_status: {path:'/integrations/status'},
  };
  const route=routes[tool];
  if (!route) throw {status:404,code:'NOT_FOUND',message:'Unknown tool'};
  if (tool!=='list_projects' && tool!=='get_provider_status' && !projectId) throw {status:400,code:'VALIDATION_ERROR',message:'projectId required'};
  const suffix=tool==='get_audit_findings' && typeof params.severity==='string' ? `?severity=${encodeURIComponent(params.severity)}` : '';
  const response=await fetch(`${apiBase.replace(/\/$/,'')}/api/v1${route.path}${suffix}`,{
    method:route.method || 'GET',headers:{Authorization:authorization,'Content-Type':'application/json'},
    ...(route.body?{body:JSON.stringify(route.body)}:{}),signal:AbortSignal.timeout(30000),
  });
  const payload=await response.json() as {data:unknown;error?:{code:string;message:string}};
  if (!response.ok) throw {status:response.status,...payload.error};
  return route.key ? {[route.key]:payload.data,...(Array.isArray(payload.data)?{count:payload.data.length}:{})} : payload.data;
}
