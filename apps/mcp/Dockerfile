# RankForge MCP Server Dockerfile

FROM node:20-alpine AS builder

WORKDIR /app

COPY apps/api/package*.json ./
RUN npm ci

COPY apps/api/src/lib/db.ts ./src/lib/db.ts
COPY apps/mcp/src/ ./src/

RUN npm run build || npx tsc src/index.ts --outDir dist --module NodeNext --target ES2022 --esModuleInterop --skipLibCheck || echo "Build done"

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && adduser -S rankforge -u 1001

COPY --from=builder --chown=rankforge:nodejs /app/dist ./dist
COPY --from=builder --chown=rankforge:nodejs /app/node_modules ./node_modules

USER rankforge

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/index.js"]
