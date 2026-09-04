-- Credit usage/refunds can now reference a studio project.
ALTER TABLE "CreditTransaction" ADD COLUMN "projectId" TEXT;
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
