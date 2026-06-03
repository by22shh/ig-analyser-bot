-- AlterTable
ALTER TABLE "credit_transactions" ADD COLUMN "photoSearchJobId" UUID;

-- CreateIndex
CREATE INDEX "credit_transactions_photoSearchJobId_idx" ON "credit_transactions"("photoSearchJobId");

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_photoSearchJobId_fkey" FOREIGN KEY ("photoSearchJobId") REFERENCES "photo_search_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
