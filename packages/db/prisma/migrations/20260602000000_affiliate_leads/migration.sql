-- CreateTable
CREATE TABLE "AffiliateLead" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "clickId" TEXT,
    "referredUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateLead_referredUserId_key" ON "AffiliateLead"("referredUserId");

-- CreateIndex
CREATE INDEX "AffiliateLead_affiliateId_idx" ON "AffiliateLead"("affiliateId");

-- AddForeignKey
ALTER TABLE "AffiliateLead" ADD CONSTRAINT "AffiliateLead_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
