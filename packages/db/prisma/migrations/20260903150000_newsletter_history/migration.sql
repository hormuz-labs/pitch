CREATE TABLE "NewsletterCampaign" (
  "id" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "ctaLabel" TEXT,
  "ctaUrl" TEXT,
  "sentByUserId" TEXT NOT NULL,
  "sentByEmail" TEXT NOT NULL,
  "sentByName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'sending',
  "recipientCount" INTEGER NOT NULL,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "NewsletterCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NewsletterDelivery" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "firstName" TEXT,
  "status" TEXT NOT NULL,
  "providerId" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NewsletterDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NewsletterCampaign_createdAt_idx" ON "NewsletterCampaign"("createdAt");
CREATE INDEX "NewsletterDelivery_campaignId_idx" ON "NewsletterDelivery"("campaignId");
CREATE INDEX "NewsletterDelivery_email_idx" ON "NewsletterDelivery"("email");

ALTER TABLE "NewsletterDelivery"
ADD CONSTRAINT "NewsletterDelivery_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "NewsletterCampaign"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
