CREATE TABLE "OnboardingSurvey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creationGoal" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "teamSize" TEXT NOT NULL,
    "monthlyVolume" TEXT NOT NULL,
    "discoverySource" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingSurvey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnboardingSurvey_userId_key" ON "OnboardingSurvey"("userId");
CREATE INDEX "OnboardingSurvey_completedAt_idx" ON "OnboardingSurvey"("completedAt");

ALTER TABLE "OnboardingSurvey"
ADD CONSTRAINT "OnboardingSurvey_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
