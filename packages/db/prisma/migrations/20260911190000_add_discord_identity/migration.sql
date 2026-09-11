ALTER TABLE "UserProfile" ADD COLUMN "discordUserId" TEXT;

CREATE UNIQUE INDEX "UserProfile_discordUserId_key" ON "UserProfile"("discordUserId");
