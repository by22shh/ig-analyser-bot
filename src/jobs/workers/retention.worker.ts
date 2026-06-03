import type { Services } from "../../modules/container.js";
import { childLogger } from "../../config/logger.js";

const log = childLogger("retention.worker");

export function startRetentionLoop(services: Services) {
  const run = async () => {
    try {
      const reports = await services.retention.cleanupExpiredReports();
      const photos = await services.retention.cleanupOldPhotoSearch();
      if (reports || photos) log.info({ reports, photos }, "retention_cleanup_done");
    } catch (error) {
      log.error({ error }, "retention_cleanup_failed");
    }
  };
  const timer = setInterval(run, 60 * 60 * 1000);
  void run();
  return timer;
}
