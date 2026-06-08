-- Align photo_search_jobs.updatedAt with Prisma's @updatedAt behavior.
-- The column is written by Prisma/update statements, so a DB default causes
-- migration drift against schema.prisma and is not needed.
ALTER TABLE "photo_search_jobs"
  ALTER COLUMN "updatedAt" DROP DEFAULT;
