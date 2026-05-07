# syntax=docker/dockerfile:1
# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM oven/bun:1-alpine AS deps

WORKDIR /app

# Copy manifests for all workspaces so bun can resolve the graph
COPY package.json bun.lock ./
COPY apps/api/package.json          ./apps/api/package.json
COPY apps/worker/package.json       ./apps/worker/package.json
COPY apps/job-cli/package.json      ./apps/job-cli/package.json
COPY apps/web/package.json          ./apps/web/package.json
COPY apps/mock-server/package.json  ./apps/mock-server/package.json
COPY packages/db/package.json       ./packages/db/package.json
COPY packages/shared/package.json   ./packages/shared/package.json
COPY packages/storage/package.json  ./packages/storage/package.json
COPY packages/email/package.json    ./packages/email/package.json

RUN bun install --frozen-lockfile --filter api --ignore-scripts

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM deps AS builder

COPY . .

RUN bun exec zenstack generate --schema packages/db/prisma/schema.zmodel --no-compile \
 && bun --filter @saas/shared run build \
 && bun --filter @saas/db run build \
 && bun --filter @saas/storage run build \
 && bun --filter @saas/email run build \
 && bun --filter api run build

# ── Stage 3: runtime ──────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS runtime

WORKDIR /app

COPY --from=builder /app/package.json              ./package.json
COPY --from=builder /app/bun.lock                  ./bun.lock
COPY --from=builder /app/node_modules              ./node_modules

COPY --from=builder /app/apps/api/dist             ./apps/api/dist
COPY --from=builder /app/apps/api/package.json     ./apps/api/package.json
COPY --from=builder /app/apps/api/node_modules     ./apps/api/node_modules

COPY --from=builder /app/packages/db/dist          ./packages/db/dist
COPY --from=builder /app/packages/db/package.json  ./packages/db/package.json
COPY --from=builder /app/packages/db/node_modules  ./packages/db/node_modules
COPY --from=builder /app/packages/db/prisma        ./packages/db/prisma
COPY --from=builder /app/packages/db/src/__model_meta.js ./packages/db/src/__model_meta.js

COPY --from=builder /app/packages/shared/dist      ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json

COPY --from=builder /app/packages/storage/dist     ./packages/storage/dist
COPY --from=builder /app/packages/storage/package.json ./packages/storage/package.json

COPY --from=builder /app/packages/email/dist       ./packages/email/dist
COPY --from=builder /app/packages/email/package.json ./packages/email/package.json

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "apps/api/dist/index.js"]
