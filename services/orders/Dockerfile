FROM node:20-alpine AS base
RUN npm install -g pnpm@9.4.0 turbo@2

# ── Stage 1: Prune workspace ───────────────────────────────────────────────
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @nexus/orders --docker

# ── Stage 2: Install dependencies ─────────────────────────────────────────
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN sed -i '/node-linker/d' .npmrc 2>/dev/null || true
RUN pnpm install --frozen-lockfile

# ── Stage 3: Build ────────────────────────────────────────────────────────
FROM installer AS builder
WORKDIR /app
COPY --from=pruner /app/out/full/ .
RUN turbo build --filter=@nexus/orders

# ── Stage 4: Production runner ────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs  && adduser  --system --uid 1001 nexus

COPY --from=builder --chown=nexus:nodejs /app/services/orders/dist ./dist
COPY --from=builder --chown=nexus:nodejs /app/services/orders/src/db/migrations ./src/db/migrations
COPY --from=builder --chown=nexus:nodejs /app/services/orders/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=nexus:nodejs /app/services/orders/package.json ./package.json
COPY --from=builder --chown=nexus:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nexus:nodejs /app/packages ./packages

# v2.7.62 � RDS CA bundle for sslmode=verify-full Postgres connections.
# See infrastructure/RUNBOOKS/01-postgres-tls-verify-full.md.
# Pinned sha256 to detect a compromised bundle URL.
COPY infrastructure/certs/rds-global-bundle.pem /etc/ssl/certs/rds-combined-ca-bundle.pem
RUN echo "e5bb2084ccf45087bda1c9bffdea0eb15ee67f0b91646106e466714f9de3c7e3  /etc/ssl/certs/rds-combined-ca-bundle.pem" | sha256sum -c -

USER nexus
EXPOSE 4004
CMD ["node", "dist/index.js"]
