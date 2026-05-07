# syntax=docker/dockerfile:1
# ── Stage 1: install & build ──────────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY . .

RUN bun install --ignore-scripts \
 && bun exec zenstack generate --schema packages/db/prisma/schema.zmodel --no-compile \
 && bun --filter @saas/db run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS runtime

WORKDIR /app

COPY --from=builder /app .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "apps/api/src/index.ts"]
