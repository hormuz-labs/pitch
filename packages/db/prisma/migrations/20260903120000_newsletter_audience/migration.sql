ALTER TABLE "NewsletterSubscriber"
ADD COLUMN "firstName" TEXT,
ADD COLUMN "userId" TEXT,
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'website',
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'subscribed',
ADD COLUMN "unsubscribeToken" TEXT,
ADD COLUMN "unsubscribedAt" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "NewsletterSubscriber"
SET "unsubscribeToken" = "id"
WHERE "unsubscribeToken" IS NULL;

ALTER TABLE "NewsletterSubscriber"
ALTER COLUMN "unsubscribeToken" SET NOT NULL;

CREATE UNIQUE INDEX "NewsletterSubscriber_userId_key"
ON "NewsletterSubscriber"("userId");

CREATE UNIQUE INDEX "NewsletterSubscriber_unsubscribeToken_key"
ON "NewsletterSubscriber"("unsubscribeToken");

CREATE INDEX "NewsletterSubscriber_status_createdAt_idx"
ON "NewsletterSubscriber"("status", "createdAt");
