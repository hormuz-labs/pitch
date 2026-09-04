-- Drop the pre-studio job queue.
--
-- The studio replaced jobs with projects: a project is a workspace and a
-- conversation, and every turn writes to it directly. Nothing has read these
-- tables since the flow collapse, and with no production users there is no
-- history worth carrying.
--
-- VideoEdition and StudioProject go with it: VideoEdition only ever hung off a
-- Job, and StudioProject was an intermediate table that never had a single
-- reader.

-- CreditTransaction keeps its rows; it just stops pointing at jobs.
ALTER TABLE "CreditTransaction" DROP CONSTRAINT IF EXISTS "CreditTransaction_jobId_fkey";
ALTER TABLE "CreditTransaction" DROP COLUMN IF EXISTS "jobId";

-- Projects imported from old jobs are no longer distinguishable from any other.
DROP INDEX IF EXISTS "Project_legacyJobId_key";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "legacyJobId";

DROP TABLE IF EXISTS "VideoEdition";
DROP TABLE IF EXISTS "StudioProject";
DROP TABLE IF EXISTS "Job";
