# RankForge API Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs
RUN adduser -S rankforge -u 1001

COPY --from=builder --chown=rankforge:nodejs /app/dist ./dist
COPY --from=builder --chown=rankforge:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=rankforge:nodejs /app/package.json ./

USER rankforge

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/v1/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/server.js"]
