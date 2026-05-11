# syntax=docker/dockerfile:1
# ── Stage 1: install & build ──────────────────────────────────────────────────
FROM oven/bun:1-debian AS builder

WORKDIR /app

COPY . .

RUN rm -rf packages/*/dist apps/*/dist \
 && bun install --ignore-scripts \
 && ./node_modules/.bin/zenstack generate --schema packages/db/prisma/schema.zmodel \
 && ./node_modules/.bin/tsc -b --force packages/shared packages/db packages/storage packages/email apps/job-cli \
 && chmod +x apps/job-cli/dist/index.js

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM oven/bun:1-debian AS runtime

WORKDIR /app

COPY --from=builder /app .

# Make job-cli globally available
RUN ln -s /app/apps/job-cli/dist/index.js /usr/local/bin/job-cli

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "bunx prisma migrate deploy --schema packages/db/prisma/schema.prisma && bun apps/api/src/index.ts"]
