# syntax=docker/dockerfile:1
# ── Stage 1: install & build ──────────────────────────────────────────────────
FROM oven/bun:1-debian AS builder

WORKDIR /app

# Cache dependencies installation layer
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/job-cli/package.json apps/job-cli/
COPY apps/mock-server/package.json apps/mock-server/
COPY apps/transcription-service/package.json apps/transcription-service/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/email/package.json packages/email/
COPY packages/shared/package.json packages/shared/
COPY packages/storage/package.json packages/storage/

# --frozen-lockfile: every workspace package.json above must be present, or the
# install aborts loudly instead of silently re-resolving (which previously drifted
# Prisma 6 → 7 and broke the schema). Add a COPY line when adding a workspace.
RUN bun install --frozen-lockfile --ignore-scripts

# Now copy the rest of the source code
COPY . .

# zenstack spawns `prisma generate` via a shell. prisma is a packages/db devDep
# and (with --ignore-scripts) isn't hoisted to the root node_modules/.bin, so the
# shell finds no local prisma and pulls Prisma 7.x from the network — which rejects
# `url = env(...)` in the schema (P1012). Put the workspace bin on PATH so it uses
# the pinned Prisma 6.19.3.
RUN PATH="/app/packages/db/node_modules/.bin:$PATH" ./node_modules/.bin/zenstack generate --schema packages/db/prisma/schema.zmodel

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM ghcr.io/hormuz-labs/pitch-base:latest AS runtime

WORKDIR /app

COPY --from=builder /app .

# Make job-cli globally available
RUN chmod +x /app/apps/job-cli/src/index.ts && ln -s /app/apps/job-cli/src/index.ts /usr/local/bin/job-cli

ENV NODE_ENV=production
EXPOSE 3000

# Use the workspace-local prisma (packages/db devDep, not hoisted to root) rather
# than `bunx prisma`, which would fetch Prisma 7.x from the network at startup and
# fail migrate deploy on `url = env(...)` (P1012). The 6.19.3 schema engine ships
# in the package, so this runs offline.
CMD ["sh", "-c", "/app/packages/db/node_modules/.bin/prisma migrate deploy --schema packages/db/prisma/schema.prisma && bun apps/api/src/index.ts"]
