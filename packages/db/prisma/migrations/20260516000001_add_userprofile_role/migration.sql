-- AlterTable: Add role column to UserProfile table
ALTER TABLE "UserProfile" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';
