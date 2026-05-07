# syntax=docker/dockerfile:1
# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM node:20-alpine AS deps

# pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy manifests for all workspaces so pnpm can resolve the graph
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json          ./apps/api/package.json
COPY apps/worker/package.json       ./apps/worker/package.json
COPY apps/job-cli/package.json      ./apps/job-cli/package.json
COPY apps/web/package.json          ./apps/web/package.json
COPY apps/mock-server/package.json  ./apps/mock-server/package.json
COPY packages/db/package.json       ./packages/db/package.json
COPY packages/shared/package.json   ./packages/shared/package.json
COPY packages/storage/package.json  ./packages/storage/package.json

# Install only production deps for the api filter (and its workspace deps)
RUN pnpm install --frozen-lockfile --filter api... --ignore-scripts

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM deps AS builder

# Copy full source
COPY . .

# Generate Prisma/ZenStack client and build all required packages
RUN pnpm exec zenstack generate --schema packages/db/prisma/schema.zmodel --no-compile \
 && pnpm --filter @saas/shared run build \
 && pnpm --filter @saas/db run build \
 && pnpm --filter @saas/storage run build \
 && pnpm --filter api run build

# ── Stage 3: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy only what is needed to run
COPY --from=builder /app/package.json              ./package.json
COPY --from=builder /app/pnpm-workspace.yaml       ./pnpm-workspace.yaml
COPY --from=builder /app/pnpm-lock.yaml            ./pnpm-lock.yaml
COPY --from=builder /app/node_modules              ./node_modules

COPY --from=builder /app/apps/api/dist             ./apps/api/dist
COPY --from=builder /app/apps/api/package.json     ./apps/api/package.json
COPY --from=builder /app/apps/api/node_modules     ./apps/api/node_modules

COPY --from=builder /app/packages/db/dist          ./packages/db/dist
COPY --from=builder /app/packages/db/package.json  ./packages/db/package.json
COPY --from=builder /app/packages/db/node_modules  ./packages/db/node_modules
# Prisma generated client + schema needed at runtime
COPY --from=builder /app/packages/db/prisma        ./packages/db/prisma
COPY --from=builder /app/packages/db/src/__model_meta.js   ./packages/db/src/__model_meta.js

COPY --from=builder /app/packages/shared/dist      ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json

COPY --from=builder /app/packages/storage/dist     ./packages/storage/dist
COPY --from=builder /app/packages/storage/package.json ./packages/storage/package.json

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apps/api/dist/index.js"]
