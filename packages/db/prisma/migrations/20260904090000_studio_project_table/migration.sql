-- Studio projects: the unit of the rebuilt app (one workspace + one agent
-- session + one preview). Job rows stay as read-only history and are imported
-- as projects (legacyJobId).
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "flow" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL DEFAULT '',
    "options" TEXT NOT NULL DEFAULT '{}',
    "sessionFile" TEXT,
    "creditsCharged" INTEGER NOT NULL DEFAULT 0,
    "outputs" TEXT NOT NULL DEFAULT '[]',
    "thumbnailUrl" TEXT,
    "lastError" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "shareSlug" TEXT,
    "shareViews" INTEGER NOT NULL DEFAULT 0,
    "legacyJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Project_shareSlug_key" ON "Project"("shareSlug");
CREATE UNIQUE INDEX "Project_legacyJobId_key" ON "Project"("legacyJobId");
CREATE UNIQUE INDEX "Project_userId_flow_name_key" ON "Project"("userId", "flow", "name");
CREATE INDEX "Project_userId_idx" ON "Project"("userId");
