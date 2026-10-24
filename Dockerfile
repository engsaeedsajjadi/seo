# RankForge Frontend Dockerfile
# Multi-stage build, optimized, non-root, health checks

FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build args
# VITE_API_URL is the API ORIGIN only (the client appends /api/v1 itself).
# Empty (default) = same-origin relative calls, proxied by nginx (/api/).
# For a split-origin deployment pass e.g. --build-arg VITE_API_URL=https://api.example.com
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL

# Build
RUN npm run build

# Runner stage
FROM nginx:alpine AS runner

# Security: non-root
RUN addgroup -g 1001 -S nodejs && adduser -S rankforge -u 1001

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80 || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
