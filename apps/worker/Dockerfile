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

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM oven/bun:1-debian AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl unzip ffmpeg ca-certificates \
    mesa-vulkan-drivers libgl1-mesa-dri libglx-mesa0 libegl1-mesa \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app .

# Install Playwright browser and its Linux UI dependencies
RUN bunx playwright install chromium --with-deps

# Allow the container user to access GPU devices (/dev/dri)
RUN groupadd -f render && usermod -aG render,video root

ENV NODE_ENV=production

CMD ["bun", "apps/worker/src/index.ts"]
