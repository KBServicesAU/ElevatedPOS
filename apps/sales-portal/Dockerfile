FROM node:20-alpine AS base
RUN npm install -g pnpm@9.4.0 turbo@2

FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @nexus/sales-portal --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN sed -i '/node-linker/d' .npmrc 2>/dev/null || true
RUN pnpm install --frozen-lockfile

FROM installer AS builder
WORKDIR /app
COPY --from=pruner /app/out/full/ .
ENV NEXT_TELEMETRY_DISABLED=1
RUN turbo build --filter=@nexus/sales-portal

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/sales-portal/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/sales-portal/.next/static ./apps/sales-portal/.next/static

# v2.7.62 — RDS CA bundle for sslmode=verify-full Postgres connections.
# See infrastructure/RUNBOOKS/01-postgres-tls-verify-full.md.
# Pinned sha256 to detect a compromised bundle URL.
COPY infrastructure/certs/rds-global-bundle.pem /etc/ssl/certs/rds-combined-ca-bundle.pem
RUN echo "e5bb2084ccf45087bda1c9bffdea0eb15ee67f0b91646106e466714f9de3c7e3  /etc/ssl/certs/rds-combined-ca-bundle.pem" | sha256sum -c -

USER nextjs
EXPOSE 53113
ENV PORT=53113
CMD ["node", "apps/sales-portal/server.js"]
