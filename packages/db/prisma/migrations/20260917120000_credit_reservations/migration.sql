CREATE TABLE "CreditReservation" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'product',
    "kind" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "credits" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "settledCredits" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditReservation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CreditReservation_credits_check" CHECK ("credits" > 0),
    CONSTRAINT "CreditReservation_settled_credits_check" CHECK ("settledCredits" IS NULL OR "settledCredits" >= 0),
    CONSTRAINT "CreditReservation_duration_check" CHECK ("durationSeconds" IS NULL OR "durationSeconds" BETWEEN 3 AND 300),
    CONSTRAINT "CreditReservation_status_check" CHECK ("status" IN ('pending', 'settled', 'released'))
);

CREATE UNIQUE INDEX "CreditReservation_key_key" ON "CreditReservation"("key");
CREATE INDEX "CreditReservation_userId_status_idx" ON "CreditReservation"("userId", "status");
CREATE INDEX "CreditReservation_projectId_status_idx" ON "CreditReservation"("projectId", "status");

ALTER TABLE "CreditReservation" ADD CONSTRAINT "CreditReservation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditReservation" ADD CONSTRAINT "CreditReservation_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
