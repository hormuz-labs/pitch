-- Add missing foreign key constraints that were omitted from prior migrations.
-- These were defined in the Prisma schema via @relation but never materialized as DDL.

-- Job.userId -> UserProfile.id (missing since init migration)
ALTER TABLE "Job" ADD CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Affiliate.userId -> UserProfile.id (missing since affiliate migration)
ALTER TABLE "Affiliate" ADD CONSTRAINT "Affiliate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Subscription.userId -> UserProfile.id (missing from redesign_credit_system)
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TopUpPurchase.userId -> UserProfile.id (missing from redesign_credit_system)
ALTER TABLE "TopUpPurchase" ADD CONSTRAINT "TopUpPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreditTransaction.userId -> UserProfile.id (missing from redesign_credit_system)
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreditTransaction.jobId -> Job.id (optional, missing from redesign_credit_system)
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreditTransaction.subscriptionId -> Subscription.id (optional, missing from redesign_credit_system)
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreditTransaction.topUpId -> TopUpPurchase.id (optional, missing from redesign_credit_system)
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_topUpId_fkey" FOREIGN KEY ("topUpId") REFERENCES "TopUpPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
