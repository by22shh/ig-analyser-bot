-- Idempotency key for photo searches. Concurrent updates (a Telegram album /
-- media-group, or a fast double-send) all read wizard state `waiting_photo`
-- before it clears, so previously each spawned its own job, reserved credits and
-- paid for a FaceCheck search. A per-session unique key lets the second
-- createJob reuse the first job instead of charging again. Nullable keeps
-- existing rows valid and (in Postgres) allows many NULLs while still deduping
-- non-null keys.
ALTER TABLE "photo_search_jobs" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "photo_search_jobs_idempotencyKey_key" ON "photo_search_jobs"("idempotencyKey");
