# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.4.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/
COPY apps/ingestion-service/package.json ./apps/ingestion-service/

RUN pnpm install --frozen-lockfile

# ─── Stage 2: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.4.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=deps /app/packages/config/node_modules ./packages/config/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/apps/ingestion-service/node_modules ./apps/ingestion-service/node_modules

COPY tsconfig.base.json ./
COPY packages/types/ ./packages/types/
COPY packages/config/ ./packages/config/
COPY packages/db/ ./packages/db/
COPY apps/ingestion-service/ ./apps/ingestion-service/

RUN pnpm --filter @sentinel/db exec prisma generate
RUN pnpm --filter @sentinel/types build
RUN pnpm --filter @sentinel/config build
RUN pnpm --filter @sentinel/ingestion-service build

# ─── Stage 3: Production Runner ───────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/apps/ingestion-service/dist ./dist
COPY --from=builder /app/apps/ingestion-service/package.json ./
COPY --from=builder /app/apps/ingestion-service/node_modules ./node_modules
COPY --from=builder /app/packages/db/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/packages/db/node_modules/@prisma ./node_modules/@prisma

EXPOSE 4002

RUN addgroup -S sentinel && adduser -S sentinel -G sentinel
USER sentinel

CMD ["node", "dist/index.js"]
