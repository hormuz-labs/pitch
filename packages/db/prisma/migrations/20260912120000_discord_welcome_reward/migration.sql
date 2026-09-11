CREATE TABLE "DiscordRewardClaim" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "creditTransactionId" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscordRewardClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscordRewardClaim_creditTransactionId_key" ON "DiscordRewardClaim"("creditTransactionId");
CREATE UNIQUE INDEX "DiscordRewardClaim_campaignId_userId_key" ON "DiscordRewardClaim"("campaignId", "userId");
CREATE UNIQUE INDEX "DiscordRewardClaim_campaignId_discordUserId_key" ON "DiscordRewardClaim"("campaignId", "discordUserId");
CREATE INDEX "DiscordRewardClaim_claimedAt_idx" ON "DiscordRewardClaim"("claimedAt");
