# syntax=docker/dockerfile:1
# ── Stage 1: install & build ──────────────────────────────────────────────────
FROM oven/bun:1-debian AS builder

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY apps/studio/package.json apps/studio/
COPY apps/studio-web/package.json apps/studio-web/
COPY apps/transcription/package.json apps/transcription/
COPY packages/db/package.json packages/db/
COPY packages/email/package.json packages/email/
COPY packages/shared/package.json packages/shared/
COPY packages/storage/package.json packages/storage/

# --frozen-lockfile: every workspace package.json above must be present, or the
# install aborts loudly instead of silently re-resolving.
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --ignore-scripts

COPY . .

# zenstack spawns `prisma generate` via a shell; put the pinned workspace
# prisma on PATH so it never pulls a newer one from the network.
RUN PATH="/app/packages/db/node_modules/.bin:$PATH" ./node_modules/.bin/zenstack generate --schema packages/db/prisma/schema.zmodel

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM ghcr.io/hormuz-labs/pitch-base:latest AS runtime

WORKDIR /app
COPY --from=builder /app .

# GPU devices (/dev/dri) for NVENC/VAAPI encodes when the host passes them.
RUN groupadd -f render && usermod -aG render,video root

ENV NODE_ENV=production
ARG GIT_HASH
ENV GIT_HASH=${GIT_HASH}
EXPOSE 3000

CMD ["sh", "-c", "bunx prisma migrate deploy --schema packages/db/prisma/schema.prisma && bun apps/studio/src/index.ts"]
