# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate

# Copy workspace manifests first (better layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/
COPY apps/auth-service/package.json ./apps/auth-service/

RUN pnpm install --frozen-lockfile

# ─── Stage 2: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.4.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=deps /app/packages/config/node_modules ./packages/config/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/apps/auth-service/node_modules ./apps/auth-service/node_modules

COPY tsconfig.base.json ./
COPY packages/types/ ./packages/types/
COPY packages/config/ ./packages/config/
COPY packages/db/ ./packages/db/
COPY apps/auth-service/ ./apps/auth-service/

# Generate Prisma client
RUN pnpm --filter @sentinel/db exec prisma generate

# Build shared packages first, then the service
RUN pnpm --filter @sentinel/types build
RUN pnpm --filter @sentinel/config build
RUN pnpm --filter @sentinel/auth-service build

# ─── Stage 3: Production Runner ───────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Only copy what's needed to run
COPY --from=builder /app/apps/auth-service/dist ./dist
COPY --from=builder /app/apps/auth-service/package.json ./
COPY --from=builder /app/apps/auth-service/node_modules ./node_modules
COPY --from=builder /app/packages/db/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/packages/db/node_modules/@prisma ./node_modules/@prisma

EXPOSE 4001

# Use non-root user for security
RUN addgroup -S sentinel && adduser -S sentinel -G sentinel
USER sentinel

CMD ["node", "dist/index.js"]
