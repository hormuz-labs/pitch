# syntax=docker/dockerfile:1
# ── Stage 1: install & build ──────────────────────────────────────────────────
FROM oven/bun:1-debian AS builder

WORKDIR /app

COPY . .

RUN rm -rf packages/*/dist apps/*/dist \
 && bun install --ignore-scripts \
 && ./node_modules/.bin/zenstack generate --schema packages/db/prisma/schema.zmodel --no-compile \
 && ./node_modules/.bin/tsc -b --force packages/shared packages/db packages/storage packages/email apps/job-cli \
 && chmod +x apps/job-cli/dist/index.js

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM oven/bun:1-debian AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl unzip ffmpeg ca-certificates \
    mesa-vulkan-drivers libgl1-mesa-dri libglx-mesa0 libegl1 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app .

# Install Playwright browser and its Linux UI dependencies
RUN bunx playwright install chromium --with-deps

# Allow the container user to access GPU devices (/dev/dri)
RUN groupadd -f render && usermod -aG render,video root

# Make job-cli globally available
RUN ln -s /app/apps/job-cli/dist/index.js /usr/local/bin/job-cli

ENV NODE_ENV=production

CMD ["bun", "apps/worker/src/index.ts"]
