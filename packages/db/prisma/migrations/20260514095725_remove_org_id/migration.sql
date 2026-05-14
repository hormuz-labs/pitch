/*
  Warnings:

  - You are about to drop the column `orgId` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `orgId` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Job_orgId_idx";

-- AlterTable
ALTER TABLE "Job" DROP COLUMN "orgId";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "orgId";

-- CreateIndex
CREATE INDEX "Job_userId_idx" ON "Job"("userId");
