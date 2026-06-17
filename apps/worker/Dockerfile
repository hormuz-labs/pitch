# syntax=docker/dockerfile:1
# ── Stage 1: install & build ──────────────────────────────────────────────────
FROM oven/bun:1-debian AS builder

WORKDIR /app

# Cache dependencies installation layer
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/job-cli/package.json apps/job-cli/
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

RUN ./node_modules/.bin/zenstack generate --schema packages/db/prisma/schema.zmodel

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM ghcr.io/hormuz-labs/pitch-base:latest AS runtime

WORKDIR /app

COPY --from=builder /app .

# Install Playwright's bundled ffmpeg for video recording.
# The system ffmpeg is not picked up by Playwright's internal executable registry.
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD= npx playwright install ffmpeg



# Allow the container user to access GPU devices (/dev/dri)
RUN groupadd -f render && usermod -aG render,video root

# Make job-cli globally available
RUN chmod +x /app/apps/job-cli/src/index.ts && ln -s /app/apps/job-cli/src/index.ts /usr/local/bin/job-cli

ENV NODE_ENV=production
ENV PATH="/root/.rtk/bin:/root/.opencode/bin:${PATH}"

CMD ["sh", "-c", "bunx prisma db push --schema packages/db/prisma/schema.prisma --accept-data-loss && bun apps/worker/src/index.ts"]
