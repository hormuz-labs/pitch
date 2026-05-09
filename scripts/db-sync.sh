#!/usr/bin/env bash
# Applies pending Prisma migrations to the target database (non-interactive).
# Safe to run in CI, staging, and production. Use db:migrate for local dev.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

"$ROOT/node_modules/.bin/dotenv" -o -e "$ROOT/.env" -- \
  "$ROOT/packages/db/node_modules/.bin/prisma" migrate deploy \
  --schema="$ROOT/packages/db/prisma/schema.prisma"
