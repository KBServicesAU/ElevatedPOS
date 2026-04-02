FROM node:20-alpine AS base
RUN npm install -g pnpm@9.4.0 turbo@2

# ── Stage 1: Prune workspace ───────────────────────────────────────────────
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @nexus/hardware-bridge --docker

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
RUN turbo build --filter=@nexus/hardware-bridge

# ── Stage 4: Production runner ────────────────────────────────────────────
# NOTE: hardware-bridge runs on-premise alongside POS hardware.
# In cloud/EKS this serves as the cloud relay endpoint.
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nexus

COPY --from=builder --chown=nexus:nodejs /app/services/hardware-bridge/dist ./dist
COPY --from=builder --chown=nexus:nodejs /app/services/hardware-bridge/package.json ./package.json
COPY --from=builder --chown=nexus:nodejs /app/node_modules ./node_modules

USER nexus
EXPOSE 9999
CMD ["node", "dist/index.js"]
