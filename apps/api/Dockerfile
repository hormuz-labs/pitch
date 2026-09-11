# syntax=docker/dockerfile:1
ARG RUNTIME_IMAGE=ghcr.io/hormuz-labs/pitch-base:latest
# ── Stage 1: install & build ──────────────────────────────────────────────────
FROM oven/bun:1-debian AS builder

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY apps/api/package.json apps/api/
COPY apps/discord-bot/package.json apps/discord-bot/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/email/package.json packages/email/
COPY packages/shared/package.json packages/shared/
COPY packages/storage/package.json packages/storage/

# --frozen-lockfile: every workspace package.json above must be present, or the
# install aborts loudly instead of silently re-resolving.
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --ignore-scripts

COPY . .

# zenstack spawns `prisma generate` via a shell. prisma is a packages/db devDep
# and (with --ignore-scripts) isn't hoisted to the root node_modules/.bin, so the
# shell finds no local prisma and pulls Prisma 7.x from the network — which rejects
# `url = env(...)` in the schema (P1012). Put the workspace bin on PATH so it uses
# the pinned Prisma 6.19.3.
RUN PATH="/app/packages/db/node_modules/.bin:$PATH" ./node_modules/.bin/zenstack generate --schema packages/db/prisma/schema.zmodel

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM ${RUNTIME_IMAGE} AS runtime

WORKDIR /app
COPY --from=builder /app .

# Host-side audio DSP, isolated from the system Python and the agent sandbox.
# The import check is best-effort: prebuilt pedalboard wheels have faulted at
# build time on some hosts (SIGILL, exit 132) while the runtime degrades
# gracefully (see lib/pedalboard.ts), so a DSP verification must never fail
# the image build or block deploys.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get -qq update \
    && apt-get install -y -qq --no-install-recommends python3 python3-venv libatomic1 libsndfile1 \
    && python3 -m venv /opt/pitch-audio \
    && /opt/pitch-audio/bin/pip install --no-cache-dir -r requirements-audio.txt \
    && (/opt/pitch-audio/bin/python -I -X faulthandler -c "import numpy; print('numpy ok'); import pedalboard; print('pedalboard ok')" || echo "WARNING: audio DSP smoke test failed - continuing without build-time verification") \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
ENV STUDIO_PYTHON=/opt/pitch-audio/bin/python

# GPU devices (/dev/dri) for NVENC/VAAPI encodes when the host passes them.
RUN groupadd -f render && usermod -aG render,video root

ENV NODE_ENV=production
ARG GIT_HASH
ENV GIT_HASH=${GIT_HASH}
EXPOSE 3000
STOPSIGNAL SIGTERM

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy --schema packages/db/prisma/schema.prisma && exec bun apps/api/src/index.ts"]
