-- Backfills the migration for the ApiKey model (table "PitchApiKey").
--
-- The model has been in schema.prisma since API keys shipped, but no migration
-- ever created it: production was brought up with `prisma db push`. Deploys run
-- `prisma migrate deploy`, which only applies migration files, so any fresh
-- environment (a new dev machine, CI, a rebuilt staging) had the code but not
-- the table, and every /mcp and /v1 request failed on the key lookup.
--
-- Everything is guarded with IF NOT EXISTS so this is a no-op where the table
-- already exists and creates it where it does not. That is why it does not look
-- like Prisma's generated output.

-- CreateTable
CREATE TABLE IF NOT EXISTS "PitchApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PitchApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PitchApiKey_keyHash_key" ON "PitchApiKey"("keyHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PitchApiKey_userId_idx" ON "PitchApiKey"("userId");

-- AddForeignKey (no IF NOT EXISTS for constraints, so check the catalogue)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PitchApiKey_userId_fkey'
    ) THEN
        ALTER TABLE "PitchApiKey"
            ADD CONSTRAINT "PitchApiKey_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "UserProfile"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END
$$;
