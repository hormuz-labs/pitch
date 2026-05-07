# syntax=docker/dockerfile:1
# ── Stage 1: install dependencies ────────────────────────────────────────────
# Use the official bun image for build stages — fast installs, native workspace support.
FROM oven/bun:1-alpine AS deps

WORKDIR /app

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

RUN bun install --frozen-lockfile --filter worker --filter job-cli --ignore-scripts

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM deps AS builder

COPY . .

RUN bun exec zenstack generate --schema packages/db/prisma/schema.zmodel --no-compile \
 && bun --filter @saas/shared run build \
 && bun --filter @saas/db run build \
 && bun --filter @saas/storage run build \
 && bun --filter @saas/email run build \
 && bun --filter worker run build \
 && bun --filter job-cli run build

# ── Stage 3: runtime (AMD ROCm) ───────────────────────────────────────────────
# rocm/dev-ubuntu-22.04 provides the full ROCm userspace (HIP, HSA) for the
# AMD RX 5500 XT. We install bun manually since we can't change this base image.
FROM rocm/dev-ubuntu-22.04:6.1 AS runtime

# Install Node.js 20, bun, ffmpeg, and runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    unzip \
    ffmpeg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && curl -fsSL https://bun.sh/install | bash \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

COPY --from=builder /app/package.json              ./package.json
COPY --from=builder /app/bun.lock                  ./bun.lock
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

COPY --from=builder /app/packages/email/dist       ./packages/email/dist
COPY --from=builder /app/packages/email/package.json ./packages/email/package.json

ENV NODE_ENV=production

# AMD RX 5500 XT is gfx1012 (Navi 14). Override to nearest supported ROCm target.
ENV HSA_OVERRIDE_GFX_VERSION=10.3.0

# Add the render group so the container can access /dev/kfd and /dev/dri
RUN groupadd -f render && usermod -aG render,video root

CMD ["bun", "apps/worker/dist/index.js"]
