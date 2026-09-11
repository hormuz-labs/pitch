-- Credits are redenominated x40: one old credit becomes 40 new ones, so a demo
-- video costs 120 instead of 3 and plans are quoted in thousands.
--
-- Balance is SUM("CreditTransaction"."delta") with no cached column, so scaling
-- every delta scales every balance by exactly the same factor and nobody's
-- wallet changes value. "Project"."creditsCharged" must move in lockstep with
-- CREDIT_USD (apps/api/src/projects/usage.ts, 0.1 -> 0.0025) or the next turn on
-- an in-flight project re-bills the difference. "Subscription"."creditsPerCycle"
-- carries each subscriber's grandfathered allowance and is what renewals grant.
UPDATE "CreditTransaction" SET "delta"           = "delta"           * 40;
UPDATE "Project"           SET "creditsCharged"  = "creditsCharged"  * 40;
UPDATE "Subscription"      SET "creditsPerCycle" = "creditsPerCycle" * 40;
UPDATE "TopUpPurchase"     SET "credits"         = "credits"         * 40;
