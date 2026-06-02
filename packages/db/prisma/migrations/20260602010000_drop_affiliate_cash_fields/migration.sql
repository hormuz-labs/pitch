-- Cash commission scrapped — rewards are paid in credits. Drop the unused
-- commission fields. (Beta: no commission was ever earned or owed.)

-- AlterTable
ALTER TABLE "Affiliate" DROP COLUMN "commissionPct";

-- AlterTable
ALTER TABLE "AffiliateConversion" DROP COLUMN "commissionAmt";
