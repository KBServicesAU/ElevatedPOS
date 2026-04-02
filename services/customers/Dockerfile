FROM node:20-alpine AS base
RUN npm install -g pnpm@9.4.0 turbo@2

# ── Stage 1: Prune workspace ───────────────────────────────────────────────
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @nexus/customers --docker

# ── Stage 2: Install dependencies ─────────────────────────────────────────
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# ── Stage 3: Build ────────────────────────────────────────────────────────
FROM installer AS builder
WORKDIR /app
COPY --from=pruner /app/out/full/ .
RUN turbo build --filter=@nexus/customers

# ── Stage 4: Production runner ────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs  && adduser  --system --uid 1001 nexus

COPY --from=builder --chown=nexus:nodejs /app/services/customers/dist ./dist
COPY --from=builder --chown=nexus:nodejs /app/services/customers/src/db/migrations ./src/db/migrations
COPY --from=builder --chown=nexus:nodejs /app/services/customers/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=nexus:nodejs /app/services/customers/package.json ./package.json
COPY --from=builder --chown=nexus:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nexus:nodejs /app/packages ./packages

USER nexus
EXPOSE 4006
CMD ["node", "dist/index.js"]
