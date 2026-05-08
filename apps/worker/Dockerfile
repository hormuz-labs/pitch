# syntax=docker/dockerfile:1
# ── Stage 1: install & build ──────────────────────────────────────────────────
FROM oven/bun:1-debian AS builder

WORKDIR /app

COPY . .

RUN rm -rf packages/*/dist apps/*/dist \
 && bun install --ignore-scripts \
 && ./node_modules/.bin/zenstack generate --schema packages/db/prisma/schema.zmodel --no-compile \
 && bun run --cwd packages/shared build \
 && bun run --cwd packages/db build

# ── Stage 2: runtime (AMD ROCm for RX 5500 XT) ───────────────────────────────
FROM rocm/dev-ubuntu-22.04:6.1 AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl unzip ffmpeg ca-certificates \
    && curl -fsSL https://bun.sh/install | bash \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

COPY --from=builder /app .

ENV NODE_ENV=production
# AMD RX 5500 XT (gfx1012) — override to nearest supported ROCm target
ENV HSA_OVERRIDE_GFX_VERSION=10.3.0

RUN groupadd -f render && usermod -aG render,video root

CMD ["bun", "apps/worker/src/index.ts"]
