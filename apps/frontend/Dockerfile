# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.4.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
COPY apps/frontend/package.json ./apps/frontend/

RUN pnpm install --frozen-lockfile

# ─── Stage 2: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.4.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=deps /app/packages/config/node_modules ./packages/config/node_modules
COPY --from=deps /app/apps/frontend/node_modules ./apps/frontend/node_modules

COPY tsconfig.base.json ./
COPY packages/types/ ./packages/types/
COPY packages/config/ ./packages/config/
COPY apps/frontend/ ./apps/frontend/

# Provide default env vars so the build succeeds. 
# Real values can be injected at runtime if using a proxy, but Vite compiles them in.
# For true runtime config in Vite, window.ENV pattern is preferred, but this works for standard deploys.
ENV VITE_API_URL=/api
ENV VITE_WS_URL=ws://localhost:4000

RUN pnpm --filter @sentinel/types build
RUN pnpm --filter @sentinel/frontend build

# ─── Stage 3: Production Nginx Server ─────────────────────────────────────────
FROM nginx:alpine AS runner

# Copy custom nginx config to handle React Router / Client-side routing
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static files
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
