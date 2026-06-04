-- Idempotency key for report-chat answers. The Telegram webhook returns HTTP 500
-- when a handler throws (so Telegram re-delivers the update) and claimUpdate
-- reprocesses failed updates. Unlike analysis/photo-search, the chat path had no
-- idempotency, so a delivery failure after capture forced a retry that reserved,
-- called the (paid) LLM and captured again — double LLM cost, and a double charge
-- if the best-effort compensating refund also failed. Keying the assistant
-- message per Telegram update lets a retry return the already-produced answer
-- instead of re-charging. Nullable keeps existing rows valid and (in Postgres)
-- allows many NULLs while still deduping non-null keys.
ALTER TABLE "report_chat_messages" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "report_chat_messages_idempotencyKey_key" ON "report_chat_messages"("idempotencyKey");
