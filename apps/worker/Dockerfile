# syntax=docker/dockerfile:1
# ── Stage 1: install & build ──────────────────────────────────────────────────
FROM oven/bun:1-debian AS builder

WORKDIR /app

# Cache dependencies installation layer
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/job-cli/package.json apps/job-cli/
COPY apps/mock-server/package.json apps/mock-server/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/email/package.json packages/email/
COPY packages/shared/package.json packages/shared/
COPY packages/storage/package.json packages/storage/

RUN bun install --ignore-scripts --verbose

# Now copy the rest of the source code
COPY . .

RUN ./node_modules/.bin/zenstack generate --schema packages/db/prisma/schema.zmodel

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM ghcr.io/hormuz-labs/pitch-base:latest AS runtime

WORKDIR /app

COPY --from=builder /app .



# Allow the container user to access GPU devices (/dev/dri)
RUN groupadd -f render && usermod -aG render,video root

# Make job-cli globally available
RUN chmod +x /app/apps/job-cli/src/index.ts && ln -s /app/apps/job-cli/src/index.ts /usr/local/bin/job-cli

ENV NODE_ENV=production
ENV PATH="/root/.rtk/bin:/root/.opencode/bin:${PATH}"

CMD ["sh", "-c", "bunx prisma migrate deploy --schema packages/db/prisma/schema.prisma && bun apps/worker/src/index.ts"]
