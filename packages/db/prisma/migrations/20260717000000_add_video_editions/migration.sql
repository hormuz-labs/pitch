-- Preserve every successful paid video render under its parent job.
CREATE TABLE "VideoEdition" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "editionNumber" INTEGER NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "rawVideoUrl" TEXT,
    "audioUrl" TEXT,
    "thumbnailUrl" TEXT,
    "storyboard" TEXT,
    "storyboardRevision" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoEdition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VideoEdition_jobId_editionNumber_key"
ON "VideoEdition"("jobId", "editionNumber");

CREATE UNIQUE INDEX "VideoEdition_jobId_videoUrl_key"
ON "VideoEdition"("jobId", "videoUrl");

CREATE INDEX "VideoEdition_jobId_createdAt_idx"
ON "VideoEdition"("jobId", "createdAt");

ALTER TABLE "VideoEdition"
ADD CONSTRAINT "VideoEdition_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing storyboard videos become Edition 1 without moving their S3 objects.
INSERT INTO "VideoEdition" (
    "id",
    "jobId",
    "editionNumber",
    "videoUrl",
    "rawVideoUrl",
    "audioUrl",
    "thumbnailUrl",
    "storyboard",
    "storyboardRevision",
    "createdAt"
)
SELECT
    'legacy_' || "id",
    "id",
    1,
    "videoUrl",
    "rawVideoUrl",
    "audioUrl",
    "thumbnailUrl",
    (("parameters"::jsonb) -> 'storyboard')::text,
    NULLIF(("parameters"::jsonb) -> 'storyboard' ->> 'revision', '')::integer,
    "updatedAt"
FROM "Job"
WHERE "videoUrl" IS NOT NULL
  AND ("parameters"::jsonb) -> 'storyboard' IS NOT NULL;
