-- Browser sessions are transient process handles and cannot survive this cutover.
DELETE FROM "BrowserSession";
ALTER TABLE "BrowserSession"
  DROP COLUMN IF EXISTS "cdpPort",
  DROP COLUMN IF EXISTS "noVncUrl",
  DROP COLUMN IF EXISTS "managerUrl",
  DROP COLUMN IF EXISTS "pid",
  ADD COLUMN "streamId" TEXT,
  ADD COLUMN "hostUrl" TEXT;
CREATE UNIQUE INDEX "BrowserSession_streamId_key" ON "BrowserSession"("streamId");
CREATE UNIQUE INDEX "BrowserSession_one_active_per_user_key"
  ON "BrowserSession"("userId") WHERE "status" IN ('STARTING', 'READY');
ALTER TABLE "BrowserProfile" DROP COLUMN IF EXISTS "profileDir";
