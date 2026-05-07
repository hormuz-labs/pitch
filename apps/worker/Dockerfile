# syntax=docker/dockerfile:1
# ── Stage 1: install dependencies ────────────────────────────────────────────
# Use a standard Node image for the build stages to keep them fast and lean.
# The ROCm base is only needed at runtime.
FROM node:20-slim AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json          ./apps/api/package.json
COPY apps/worker/package.json       ./apps/worker/package.json
COPY apps/job-cli/package.json      ./apps/job-cli/package.json
COPY apps/web/package.json          ./apps/web/package.json
COPY apps/mock-server/package.json  ./apps/mock-server/package.json
COPY packages/db/package.json       ./packages/db/package.json
COPY packages/shared/package.json   ./packages/shared/package.json
COPY packages/storage/package.json  ./packages/storage/package.json

RUN pnpm install --frozen-lockfile --filter worker... --filter job-cli... --ignore-scripts

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM deps AS builder

COPY . .

RUN pnpm exec zenstack generate --schema packages/db/prisma/schema.zmodel --no-compile \
 && pnpm --filter @saas/shared run build \
 && pnpm --filter @saas/db run build \
 && pnpm --filter @saas/storage run build \
 && pnpm --filter worker run build \
 && pnpm --filter job-cli run build

# ── Stage 3: runtime (AMD ROCm) ───────────────────────────────────────────────
# rocm/dev-ubuntu-22.04 ships the full ROCm userspace stack (HIP, HSA, ROCm libs).
# ffmpeg is installed from the ROCm-aware apt repo so it can use AMF/HIP encoding.
FROM rocm/dev-ubuntu-22.04:6.1 AS runtime

# Install Node.js 20 and runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    ffmpeg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && corepack enable && corepack prepare pnpm@latest --activate \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built artefacts from builder
COPY --from=builder /app/package.json              ./package.json
COPY --from=builder /app/pnpm-workspace.yaml       ./pnpm-workspace.yaml
COPY --from=builder /app/pnpm-lock.yaml            ./pnpm-lock.yaml
COPY --from=builder /app/node_modules              ./node_modules

COPY --from=builder /app/apps/worker/dist          ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json  ./apps/worker/package.json
COPY --from=builder /app/apps/worker/node_modules  ./apps/worker/node_modules

# job-cli is invoked by the worker agent at runtime
COPY --from=builder /app/apps/job-cli/dist         ./apps/job-cli/dist
COPY --from=builder /app/apps/job-cli/package.json ./apps/job-cli/package.json
COPY --from=builder /app/apps/job-cli/node_modules ./apps/job-cli/node_modules

COPY --from=builder /app/packages/db/dist          ./packages/db/dist
COPY --from=builder /app/packages/db/package.json  ./packages/db/package.json
COPY --from=builder /app/packages/db/node_modules  ./packages/db/node_modules
COPY --from=builder /app/packages/db/prisma        ./packages/db/prisma
COPY --from=builder /app/packages/db/src/__model_meta.js ./packages/db/src/__model_meta.js

COPY --from=builder /app/packages/shared/dist      ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json

COPY --from=builder /app/packages/storage/dist     ./packages/storage/dist
COPY --from=builder /app/packages/storage/package.json ./packages/storage/package.json

ENV NODE_ENV=production

# AMD RX 5500 XT is gfx1012 (Navi 14). It is not on ROCm's official supported
# list but works correctly when we override the GFX version to the nearest
# supported target (gfx1030 / 10.3.0).
ENV HSA_OVERRIDE_GFX_VERSION=10.3.0

# Add the render group so the container can access /dev/kfd and /dev/dri
RUN groupadd -f render && usermod -aG render,video root

CMD ["node", "apps/worker/dist/index.js"]
