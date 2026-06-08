-- Keep a stable non-raw Telegram identity marker so `/delete_me` can anonymize
-- telegramId without letting the same account receive the welcome bonus again.
ALTER TABLE "users" ADD COLUMN "telegramIdentityHash" TEXT;

CREATE UNIQUE INDEX "users_telegramIdentityHash_key" ON "users"("telegramIdentityHash");

-- Chat messages do not have an owning job row. This ledger scope lets chat
-- reserve/capture/release operations affect only the reservation for one answer.
ALTER TABLE "credit_transactions" ADD COLUMN "reportChatMessageId" UUID;

CREATE INDEX "credit_transactions_reportChatMessageId_idx" ON "credit_transactions"("reportChatMessageId");
