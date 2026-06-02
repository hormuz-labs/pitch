-- CreateTable
CREATE TABLE "BrowserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileDir" TEXT NOT NULL,
    "storageStateKey" TEXT,
    "loggedInOrigins" TEXT NOT NULL DEFAULT '[]',
    "lastSyncedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrowserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrowserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STARTING',
    "startUrl" TEXT,
    "cdpPort" INTEGER,
    "noVncUrl" TEXT,
    "pid" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrowserSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrowserProfile_userId_key" ON "BrowserProfile"("userId");

-- CreateIndex
CREATE INDEX "BrowserSession_userId_status_idx" ON "BrowserSession"("userId", "status");

-- AddForeignKey
ALTER TABLE "BrowserProfile" ADD CONSTRAINT "BrowserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrowserSession" ADD CONSTRAINT "BrowserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrowserSession" ADD CONSTRAINT "BrowserSession_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "BrowserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
