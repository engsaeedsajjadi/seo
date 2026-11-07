#!/bin/bash
# End-to-end rank check through the real API and worker with only a SerpApi-format provider.
# A local server stands in for SerpApi (fake-serp.mjs); no real search is made.
# Needs the local PostgreSQL used by the other tests. Usage: tests/rank/run.sh [work-dir]
set -e
HERE=$(cd "$(dirname "$0")" && pwd); REPO=$(cd "$HERE/../.." && pwd)
S=${1:-/tmp/seoyar-rank}; mkdir -p "$S"; cp "$HERE"/*.mjs "$S"/; : > "$S/serp.log"
export JWT_SECRET=${JWT_SECRET:-dev-only-jwt-secret-0123456789abcdef0123456789} ENCRYPTION_KEY=${ENCRYPTION_KEY:-dev-only-enc-key-0123456789abcdef0123456789}
fuser -k 5999/tcp 3001/tcp 2>/dev/null || true; pkill -f "apps/worker/src/index.ts" || true; sleep 1
(setsid nohup node "$S/fake-serp.mjs" "$S/serp.log" > /dev/null 2>&1 < /dev/null &)
cd "$REPO/apps/api"
(NODE_ENV=test PORT=3001 SERPAPI_KEY=local-fake-serp-key DATABASE_URL=postgresql://rankforge_api_system_login:devapi@localhost:5432/rankforge APP_DATABASE_URL=postgresql://rankforge_api_login:devapi@localhost:5432/rankforge APP_URL=http://localhost:4173 CORS_ORIGINS=http://localhost:4173 setsid nohup node --import tsx src/index.ts > "$S/api.log" 2>&1 < /dev/null &)
cd "$REPO"
(NODE_ENV=test DATABASE_URL=postgresql://rankforge_worker_login:devworker@localhost:5432/rankforge WORKER_POLL_INTERVAL=200 SERPAPI_KEY=local-fake-serp-key SERPAPI_BASE_URL=http://127.0.0.1:5999 RANK_CHECK_DEPTH=30 setsid nohup node --import tsx apps/worker/src/index.ts > "$S/worker.log" 2>&1 < /dev/null &)
for i in $(seq 1 40); do curl -sf localhost:3001/api/v1/health > /dev/null 2>&1 && break; sleep 0.5; done
node "$S/rank-e2e.mjs" "$S"
