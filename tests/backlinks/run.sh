#!/bin/bash
# Backlink discovery end to end: real API and worker, a local stand-in for the Common Crawl graph.
# Usage: tests/backlinks/run.sh [work-dir]
set -e
HERE=$(cd "$(dirname "$0")" && pwd); REPO=$(cd "$HERE/../.." && pwd)
S=${1:-/tmp/seoyar-backlinks}; mkdir -p "$S"
export JWT_SECRET=${JWT_SECRET:-dev-only-jwt-secret-0123456789abcdef0123456789} ENCRYPTION_KEY=${ENCRYPTION_KEY:-dev-only-enc-key-0123456789abcdef0123456789}
API_DB="DATABASE_URL=postgresql://rankforge_api_system_login:devapi@localhost:5432/rankforge APP_DATABASE_URL=postgresql://rankforge_api_login:devapi@localhost:5432/rankforge"
start_worker() {
  pkill -f "apps/worker/src/index.ts" || true; sleep 1
  (cd "$REPO" && NODE_ENV=test DATABASE_URL=postgresql://rankforge_worker_login:devworker@localhost:5432/rankforge WORKER_POLL_INTERVAL=200 \
    COMMONCRAWL_GRAPH_URL=http://127.0.0.1:5997/hg COMMONCRAWL_GRAPH_RELEASE="$1" setsid nohup node --import tsx apps/worker/src/index.ts > "$S/worker-$1.log" 2>&1 < /dev/null &)
  sleep 4
}
fuser -k 5997/tcp 3001/tcp 2>/dev/null || true; pkill -f "apps/worker/src/index.ts" || true; sleep 1
(cd "$REPO/apps/api" && env NODE_ENV=test PORT=3001 $API_DB APP_URL=http://localhost:4173 CORS_ORIGINS=http://localhost:4173 setsid nohup node --import tsx src/index.ts > "$S/api.log" 2>&1 < /dev/null &)
for i in $(seq 1 40); do curl -s localhost:3001/api/v1/health > /dev/null 2>&1 && break; sleep 0.5; done; sleep 1
TAG=$(date +%s%N | tail -c 9)
PROJECT="site-$TAG.rankforge.test"; RIVAL="rival-$TAG.rankforge.test"
node -e "
const base='http://127.0.0.1:3001/api/v1'; const h={'content-type':'application/json',origin:'http://localhost:4173'};
(async()=>{const s=await (await fetch(base+'/auth/signup',{method:'POST',headers:h,body:JSON.stringify({email:'bl-$TAG@example.test',password:'Str0ng!Passw0rd#22',name:'bl'})})).json();
h.authorization='Bearer '+s.data.token;
const p=await (await fetch(base+'/projects',{method:'POST',headers:h,body:JSON.stringify({name:'B',domain:'$PROJECT',country:'IR',language:'fa'})})).json();
require('fs').writeFileSync('$S/ctx.json',JSON.stringify({token:s.data.token,pid:p.data.id,email:'bl-$TAG@example.test'}));})()"
# The competitor API checks that the domain resolves; the synthetic one does not, so it is inserted directly.
PID=$(node -pe "require('$S/ctx.json').pid")
psql -q "${DATABASE_URL:-postgresql://rankforge:devpass@localhost:5432/rankforge}" -c "INSERT INTO competitors (project_id, organization_id, domain, normalized_domain, source)
  SELECT id, organization_id, '$RIVAL', '$RIVAL', 'manual' FROM projects WHERE id = '$PID'" > /dev/null
(setsid nohup node "$HERE/fake-graph.mjs" "$PROJECT" "$RIVAL" > /dev/null 2>&1 < /dev/null &)
start_worker cc-main-test-a
node "$HERE/backlinks-e2e.mjs" a "$S/ctx.json"
start_worker cc-main-test-b
node "$HERE/backlinks-e2e.mjs" b "$S/ctx.json"
