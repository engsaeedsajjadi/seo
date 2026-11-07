#!/bin/bash
# End-to-end KWRank sync through the real API and worker against a local stand-in (no real KWRank call).
# Usage: tests/rank/run-kwrank.sh [work-dir] [client-secret-for-the-worker]
set -e
HERE=$(cd "$(dirname "$0")" && pwd); REPO=$(cd "$HERE/../.." && pwd)
S=${1:-/tmp/seoyar-kwrank}; SECRET=${2:-local-kw-secret}; mkdir -p "$S"
export JWT_SECRET=${JWT_SECRET:-dev-only-jwt-secret-0123456789abcdef0123456789} ENCRYPTION_KEY=${ENCRYPTION_KEY:-dev-only-enc-key-0123456789abcdef0123456789}
fuser -k 5998/tcp 3001/tcp 2>/dev/null || true; pkill -f "apps/worker/src/index.ts" || true; sleep 1
(setsid nohup node "$HERE/fake-kwrank.mjs" > "$S/fake.log" 2>&1 < /dev/null &)
cd "$REPO/apps/api"
(NODE_ENV=test PORT=3001 KWRANK_CLIENT_ID=local-kw-id DATABASE_URL=postgresql://rankforge_api_system_login:devapi@localhost:5432/rankforge APP_DATABASE_URL=postgresql://rankforge_api_login:devapi@localhost:5432/rankforge APP_URL=http://localhost:4173 CORS_ORIGINS=http://localhost:4173 setsid nohup node --import tsx src/index.ts > "$S/api.log" 2>&1 < /dev/null &)
cd "$REPO"
(NODE_ENV=test DATABASE_URL=postgresql://rankforge_worker_login:devworker@localhost:5432/rankforge WORKER_POLL_INTERVAL=200 KWRANK_CLIENT_ID=local-kw-id KWRANK_CLIENT_SECRET="$SECRET" KWRANK_BASE_URL=http://127.0.0.1:5998/api/v1 setsid nohup node --import tsx apps/worker/src/index.ts > "$S/worker.log" 2>&1 < /dev/null &)
for i in $(seq 1 40); do curl -s localhost:3001/api/v1/health > /dev/null 2>&1 && break; sleep 0.5; done
sleep 1
node "$HERE/kwrank-e2e.mjs"
