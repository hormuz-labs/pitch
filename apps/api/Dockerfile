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

WORKDIR /app

COPY --from=builder /app .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "apps/api/src/index.ts"]
