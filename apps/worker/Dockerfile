# RankForge Worker Dockerfile
# The worker intentionally executes its TypeScript entrypoint with the API runtime
# dependencies because the worker imports the shared crawler/audit/config modules
# from apps/api. This keeps one authoritative implementation of those modules.

FROM node:20-alpine AS builder

WORKDIR /app

COPY apps/api/package*.json ./api/
RUN cd api && npm ci

COPY apps/api/ ./api/
COPY apps/worker/ ./worker/
COPY packages/ ./packages/

# Validate the authoritative API build before packaging the worker runtime.
WORKDIR /app/api
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && adduser -S rankforge -u 1001

COPY --from=builder --chown=rankforge:nodejs /app/api/node_modules ./node_modules
COPY --from=builder --chown=rankforge:nodejs /app/api/dist ./api/dist
COPY --from=builder --chown=rankforge:nodejs /app/api/src ./api/src
COPY --from=builder --chown=rankforge:nodejs /app/worker/src ./worker-src

USER rankforge

# Worker source imports API source modules. tsx is supplied by the API runtime
# dependencies and provides a deterministic ESM TypeScript runtime.
CMD ["node_modules/.bin/tsx", "worker-src/index.ts"]
