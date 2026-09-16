# RankForge Worker Dockerfile
# Context: apps/worker/

FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . ./

# Validate build
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && adduser -S rankforge -u 1001

COPY --from=builder --chown=rankforge:nodejs /app/dist ./dist
COPY --from=builder --chown=rankforge:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=rankforge:nodejs /app/package.json ./
COPY --from=builder --chown=rankforge:nodejs /app/src ./src

USER rankforge

CMD ["node", "dist/index.js"]
