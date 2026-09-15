-- AlterTable
ALTER TABLE "BrowserSession" ADD COLUMN     "managerUrl" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "artifactKind" TEXT,
ADD COLUMN     "busyAt" TIMESTAMP(3),
ADD COLUMN     "lastWorkerId" TEXT,
ADD COLUMN     "leasedAt" TIMESTAMP(3),
ADD COLUMN     "workerEpoch" INTEGER,
ADD COLUMN     "workerId" TEXT,
ADD COLUMN     "workspaceCheckpointAt" TIMESTAMP(3),
ADD COLUMN     "workspaceVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "StudioWorker" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "slots" INTEGER NOT NULL DEFAULT 4,
    "epoch" INTEGER NOT NULL DEFAULT 1,
    "draining" BOOLEAN NOT NULL DEFAULT false,
    "version" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioWorker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_workerId_idx" ON "Project"("workerId");

