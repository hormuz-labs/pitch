-- The launch-video registry becomes the studio registry: one row per agent
-- workspace of any flow. OpenCode session ids are replaced by pi session files
-- (nullable — set the first time the agent speaks); old rows keep their name
-- and owner and simply start a fresh session on the next prompt.
ALTER TABLE "LaunchVideoProject" RENAME TO "StudioProject";
ALTER TABLE "StudioProject" RENAME CONSTRAINT "LaunchVideoProject_pkey" TO "StudioProject_pkey";

DROP INDEX IF EXISTS "LaunchVideoProject_opencodeSessionId_key";
DROP INDEX IF EXISTS "LaunchVideoProject_userId_name_key";
DROP INDEX IF EXISTS "LaunchVideoProject_userId_idx";

ALTER TABLE "StudioProject" DROP COLUMN "opencodeSessionId";
ALTER TABLE "StudioProject" ADD COLUMN "flow" TEXT NOT NULL DEFAULT 'launch-video';
ALTER TABLE "StudioProject" ADD COLUMN "sessionFile" TEXT;
ALTER TABLE "StudioProject" ADD COLUMN "jobId" TEXT;

CREATE UNIQUE INDEX "StudioProject_userId_flow_name_key" ON "StudioProject"("userId", "flow", "name");
CREATE INDEX "StudioProject_userId_idx" ON "StudioProject"("userId");
CREATE INDEX "StudioProject_jobId_idx" ON "StudioProject"("jobId");
