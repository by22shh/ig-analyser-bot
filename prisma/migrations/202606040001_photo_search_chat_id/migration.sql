-- Store the chat that initiated a photo search so worker notifications return
-- to the same conversation. Nullable keeps existing queued/completed rows valid.
ALTER TABLE "photo_search_jobs" ADD COLUMN "telegramChatId" BIGINT;
