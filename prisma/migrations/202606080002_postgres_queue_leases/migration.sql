-- Add explicit leasing and retry metadata for the Postgres queue driver.
ALTER TABLE "analysis_jobs"
  ADD COLUMN "queueAttemptsMade" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "queueMaxAttempts" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "queueLockedBy" TEXT,
  ADD COLUMN "queueLockedUntil" TIMESTAMP(3),
  ADD COLUMN "queueNextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "analysis_jobs_status_queueNextRunAt_createdAt_idx"
  ON "analysis_jobs"("status", "queueNextRunAt", "createdAt");

CREATE INDEX "analysis_jobs_queueLockedUntil_idx"
  ON "analysis_jobs"("queueLockedUntil");

ALTER TABLE "photo_search_jobs"
  ADD COLUMN "queueAttemptsMade" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "queueMaxAttempts" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "queueLockedBy" TEXT,
  ADD COLUMN "queueLockedUntil" TIMESTAMP(3),
  ADD COLUMN "queueNextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "photo_search_jobs_status_queueNextRunAt_createdAt_idx"
  ON "photo_search_jobs"("status", "queueNextRunAt", "createdAt");

CREATE INDEX "photo_search_jobs_queueLockedUntil_idx"
  ON "photo_search_jobs"("queueLockedUntil");
