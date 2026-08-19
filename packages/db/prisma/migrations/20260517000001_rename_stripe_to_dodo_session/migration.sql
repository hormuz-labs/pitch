-- Rename stripeSessionId -> dodoSessionId on AffiliateConversion
ALTER TABLE "AffiliateConversion" ADD COLUMN "dodoSessionId" TEXT;
UPDATE "AffiliateConversion" SET "dodoSessionId" = "stripeSessionId" WHERE "stripeSessionId" IS NOT NULL;
ALTER TABLE "AffiliateConversion" DROP COLUMN "stripeSessionId";
