FROM node:20-alpine AS base
RUN npm install -g pnpm@9.4.0 turbo@2

# ── Stage 1: Prune workspace ───────────────────────────────────────────────
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @nexus/web-backoffice --docker

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
ENV NEXT_TELEMETRY_DISABLED=1
RUN turbo build --filter=@nexus/web-backoffice

# ── Stage 4: Production runner ────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Standalone output includes only required files
COPY --from=builder --chown=nextjs:nodejs /app/apps/web-backoffice/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web-backoffice/.next/static ./apps/web-backoffice/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web-backoffice/public ./apps/web-backoffice/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "apps/web-backoffice/server.js"]
