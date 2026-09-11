-- Settings surface: a public handle and notification preferences on the
-- profile, redeemable promo codes, and the attribution needed to split usage
-- between the app and the public API.

ALTER TABLE "UserProfile" ADD COLUMN "username" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "emailNotifications" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserProfile" ADD COLUMN "browserNotifications" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "UserProfile_username_key" ON "UserProfile"("username");

CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "maxRedemptions" INTEGER,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

CREATE TABLE "PromoCodeRedemption" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCodeRedemption_pkey" PRIMARY KEY ("id")
);

-- The unique pair is the once-per-account rule: two concurrent redemptions of
-- the same code cannot both succeed.
CREATE UNIQUE INDEX "PromoCodeRedemption_userId_codeId_key" ON "PromoCodeRedemption"("userId", "codeId");
CREATE INDEX "PromoCodeRedemption_codeId_idx" ON "PromoCodeRedemption"("codeId");

ALTER TABLE "PromoCodeRedemption"
ADD CONSTRAINT "PromoCodeRedemption_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PromoCodeRedemption"
ADD CONSTRAINT "PromoCodeRedemption_codeId_fkey"
FOREIGN KEY ("codeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Project" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'app';
ALTER TABLE "CreditTransaction" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'product';

-- Serves the date-range usage query behind the settings chart.
CREATE INDEX "CreditTransaction_userId_createdAt_idx" ON "CreditTransaction"("userId", "createdAt");
