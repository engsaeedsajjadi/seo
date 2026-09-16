# RankForge Worker Dockerfile

FROM node:20-alpine AS builder

WORKDIR /app

COPY apps/api/package*.json ./
RUN npm ci

COPY apps/api/ ./api/
COPY apps/worker/ ./worker/
COPY packages/ ./packages/

# Build API (worker uses same deps)
WORKDIR /app/api
RUN npm run build

WORKDIR /app/worker
COPY package.json ./
RUN npm ci || echo "No worker package.json, using api"

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && adduser -S rankforge -u 1001

COPY --from=builder --chown=rankforge:nodejs /app/api/dist ./dist
COPY --from=builder --chown=rankforge:nodejs /app/api/node_modules ./node_modules
COPY --from=builder --chown=rankforge:nodejs /app/worker/src ./worker-src

USER rankforge

CMD ["node", "dist/index.js"]
