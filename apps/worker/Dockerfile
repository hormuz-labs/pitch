# syntax=docker/dockerfile:1
# ── Stage 1: install & build ──────────────────────────────────────────────────
FROM oven/bun:1-debian AS builder

WORKDIR /app

# Cache dependencies installation layer
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/transcription/package.json apps/transcription/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/email/package.json packages/email/
COPY packages/shared/package.json packages/shared/
COPY packages/storage/package.json packages/storage/


# BuildKit cache mount: keeps the bun package cache between builds on CI runners
# so subsequent builds skip the multi-minute download of 1000+ packages.
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --ignore-scripts

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

# Background loops are committed as binaries now; if they ever need regenerating,
# run `bun scripts/generate-backgrounds.ts` locally and commit the outputs.

# Allow the container user to access GPU devices (/dev/dri)
RUN groupadd -f render && usermod -aG render,video root

ENV NODE_ENV=production
ENV PATH="/root/.rtk/bin:/root/.opencode/bin:${PATH}"
ARG GIT_HASH
ENV GIT_HASH=${GIT_HASH}

CMD ["sh", "-c", "bunx prisma db push --schema packages/db/prisma/schema.prisma --accept-data-loss && bun apps/worker/src/index.ts"]
