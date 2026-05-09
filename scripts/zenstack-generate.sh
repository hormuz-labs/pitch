#!/usr/bin/env bash
# Regenerates ZenStack/Prisma artifacts and symlinks the output into every copy
# of @zenstackhq/runtime that Bun may have cached in node_modules.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Generating ZenStack artifacts..."
bunx zenstack generate --schema "$ROOT/packages/db/prisma/schema.zmodel"

echo "Symlinking .zenstack into all runtime copies..."
find "$ROOT/node_modules" -path '*/@zenstackhq/runtime' -type d \
  | xargs -I{} ln -sfn "$ROOT/node_modules/.zenstack" "{}/.zenstack"

echo "Done."
