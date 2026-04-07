FROM node:20-alpine AS base
RUN npm install -g pnpm@9.4.0 turbo@2

FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @nexus/webhooks --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN sed -i '/node-linker/d' .npmrc 2>/dev/null || true
RUN pnpm install --frozen-lockfile

FROM installer AS builder
WORKDIR /app
COPY --from=pruner /app/out/full/ .
RUN turbo build --filter=@nexus/webhooks

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nexus
COPY --from=builder --chown=nexus:nodejs /app/services/webhooks/dist ./dist
COPY --from=builder --chown=nexus:nodejs /app/services/webhooks/src/db/migrations ./src/db/migrations
COPY --from=builder --chown=nexus:nodejs /app/services/webhooks/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=nexus:nodejs /app/services/webhooks/package.json ./package.json
COPY --from=builder --chown=nexus:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nexus:nodejs /app/packages ./packages
USER nexus
EXPOSE 4015
CMD ["node", "dist/index.js"]
