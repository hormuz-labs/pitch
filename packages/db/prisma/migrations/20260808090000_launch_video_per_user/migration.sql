-- Per-user isolation for launch-video projects.
-- Backfill: the single pre-existing row was created from the dashboard before
-- isolation existed; attribute it to the primary account.
ALTER TABLE "LaunchVideoProject" ADD COLUMN "userId" TEXT;
UPDATE "LaunchVideoProject" SET "userId" = 'user_3FaqVvsvVjwYbyHKh6dHwdze0t4' WHERE "userId" IS NULL;
ALTER TABLE "LaunchVideoProject" ALTER COLUMN "userId" SET NOT NULL;

-- DropIndex
DROP INDEX "LaunchVideoProject_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "LaunchVideoProject_opencodeSessionId_key" ON "LaunchVideoProject"("opencodeSessionId");

-- CreateIndex
CREATE INDEX "LaunchVideoProject_userId_idx" ON "LaunchVideoProject"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LaunchVideoProject_userId_name_key" ON "LaunchVideoProject"("userId", "name");
