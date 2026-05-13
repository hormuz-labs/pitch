-- Make Job.orgId nullable so job creation works without an org context.
-- The column exists (added in init) but was removed from the Prisma schema,
-- causing NOT NULL violations when the field isn't supplied.
ALTER TABLE "Job" ALTER COLUMN "orgId" DROP NOT NULL;
