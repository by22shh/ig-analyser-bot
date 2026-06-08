import type { Services } from "../../modules/container.js";
import { childLogger } from "../../config/logger.js";

const log = childLogger("retention.worker");
const RETENTION_INTERVAL_MS = 60 * 60 * 1000;

export type RetentionLoopHandle = {
  stop(): void;
};

export function startRetentionLoop(services: Services): RetentionLoopHandle {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = async () => {
    try {
      const reports = await services.retention.cleanupExpiredReports();
      const photos = await services.retention.cleanupOldPhotoSearch();
      const chats = await services.chat.recoverStalePendingAnswers();
      if (reports || photos || chats)
        log.info({ reports, photos, chats }, "retention_cleanup_done");
    } catch (error) {
      log.error({ error }, "retention_cleanup_failed");
    } finally {
      if (!stopped) timer = setTimeout(run, RETENTION_INTERVAL_MS);
    }
  };
  void run();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    }
  };
}
