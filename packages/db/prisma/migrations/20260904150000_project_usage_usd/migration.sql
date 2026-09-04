-- Usage-based billing: the studio meters model spend and render seconds per
-- project instead of charging a fixed price per flow up front.
ALTER TABLE "Project" ADD COLUMN "usageUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
