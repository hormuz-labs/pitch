-- AddColumn
ALTER TABLE "Project" ADD COLUMN "lastActivityAt" TIMESTAMP(3);

-- Preserve the current recency order for existing projects.
UPDATE "Project" SET "lastActivityAt" = "updatedAt";

ALTER TABLE "Project" ALTER COLUMN "lastActivityAt" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "lastActivityAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Project_userId_lastActivityAt_idx" ON "Project"("userId", "lastActivityAt");
