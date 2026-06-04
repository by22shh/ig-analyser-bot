-- Existing rows were inserted only after the update reached this middleware, so
-- treat them as already processed when introducing explicit update statuses.
ALTER TABLE "telegram_updates" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'processed';
ALTER TABLE "telegram_updates" ADD COLUMN "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "telegram_updates" ADD COLUMN "failedAt" TIMESTAMP(3);
ALTER TABLE "telegram_updates" ADD COLUMN "errorMessage" TEXT;

ALTER TABLE "telegram_updates" ALTER COLUMN "processedAt" DROP NOT NULL;
ALTER TABLE "telegram_updates" ALTER COLUMN "status" SET DEFAULT 'processing';
