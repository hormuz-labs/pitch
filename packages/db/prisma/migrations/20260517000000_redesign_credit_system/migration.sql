-- ============================================================
-- Migration: redesign_credit_system
-- Replaces the flat CreditBalance + CreditTransaction tables
-- with a proper Subscription, TopUpPurchase, and enriched
-- CreditTransaction ledger. Balance is now calculated from
-- SUM(delta) instead of being stored as a mutable counter.
-- ============================================================

-- 1. Drop old FK constraint so we can drop CreditBalance
ALTER TABLE "CreditTransaction" DROP CONSTRAINT IF EXISTS "CreditTransaction_tenantId_fkey";

-- 2. Drop old tables
DROP TABLE IF EXISTS "CreditTransaction";
DROP TABLE IF EXISTS "CreditBalance";

-- 3. Create Subscription table
CREATE TABLE "Subscription" (
    "id"                 TEXT NOT NULL,
    "userId"             TEXT NOT NULL,
    "dodoSubscriptionId" TEXT NOT NULL,
    "planKey"            TEXT NOT NULL,
    "status"             TEXT NOT NULL DEFAULT 'active',
    "creditsPerCycle"    INTEGER NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd"   TIMESTAMP(3) NOT NULL,
    "cancelledAt"        TIMESTAMP(3),
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscription_dodoSubscriptionId_key" ON "Subscription"("dodoSubscriptionId");
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");
CREATE INDEX "Subscription_dodoSubscriptionId_idx" ON "Subscription"("dodoSubscriptionId");

-- 4. Create TopUpPurchase table
CREATE TABLE "TopUpPurchase" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "dodoPaymentId" TEXT NOT NULL,
    "packKey"       TEXT NOT NULL,
    "credits"       INTEGER NOT NULL,
    "amountUsd"     DOUBLE PRECISION NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopUpPurchase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TopUpPurchase_dodoPaymentId_key" ON "TopUpPurchase"("dodoPaymentId");
CREATE INDEX "TopUpPurchase_userId_idx" ON "TopUpPurchase"("userId");
CREATE INDEX "TopUpPurchase_dodoPaymentId_idx" ON "TopUpPurchase"("dodoPaymentId");

-- 5. Create new CreditTransaction ledger
CREATE TABLE "CreditTransaction" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "delta"          INTEGER NOT NULL,
    "type"           TEXT NOT NULL,
    "description"    TEXT NOT NULL,
    "jobId"          TEXT,
    "subscriptionId" TEXT,
    "topUpId"        TEXT,
    "idempotencyKey" TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditTransaction_idempotencyKey_key"   ON "CreditTransaction"("idempotencyKey");
CREATE INDEX        "CreditTransaction_userId_idx"           ON "CreditTransaction"("userId");
CREATE INDEX        "CreditTransaction_idempotencyKey_idx"   ON "CreditTransaction"("idempotencyKey");
