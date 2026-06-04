-- Keep telegram_updates.processedAt aligned with schema.prisma:
-- it is set only after successful processing, never on insert.
ALTER TABLE "telegram_updates" ALTER COLUMN "processedAt" DROP DEFAULT;
