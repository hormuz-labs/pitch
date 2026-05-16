-- AlterTable: Add error, workerId, and cost columns to Job table
ALTER TABLE "Job" ADD COLUMN "error" TEXT;
ALTER TABLE "Job" ADD COLUMN "workerId" TEXT;
ALTER TABLE "Job" ADD COLUMN "cost" DOUBLE PRECISION NOT NULL DEFAULT 0;
