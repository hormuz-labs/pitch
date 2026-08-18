-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shareSlug" TEXT,
ADD COLUMN     "shareViews" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Job_shareSlug_key" ON "Job"("shareSlug");
