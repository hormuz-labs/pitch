-- AlterTable: Add nullable phases column to Job table for real-time progress tracking
ALTER TABLE "Job" ADD COLUMN "phases" TEXT;
