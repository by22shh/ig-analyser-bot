import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { createServices } from "./modules/container.js";
import { createBot } from "./telegram/bot.js";
import { startAnalysisWorker } from "./jobs/workers/analysis.worker.js";
import { startPhotoSearchWorker } from "./jobs/workers/photo-search.worker.js";
import { startRetentionLoop } from "./jobs/workers/retention.worker.js";
import { startJobRecoveryLoop } from "./jobs/recovery.js";

const services = createServices();
const bot = env.TELEGRAM_BOT_TOKEN ? createBot(services) : undefined;

const analysisWorker = startAnalysisWorker({
  prisma: services.prisma,
  bot,
  instagram: services.instagram,
  llm: services.llm,
  reportService: services.reports
});

const photoSearchWorker = startPhotoSearchWorker({
  prisma: services.prisma,
  bot,
  facecheck: services.facecheck
});

const retentionTimer = startRetentionLoop(services);
const jobRecoveryTimer = startJobRecoveryLoop({ prisma: services.prisma });

logger.info("workers_started");

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "workers_shutting_down");
  retentionTimer.stop();
  jobRecoveryTimer.stop();
  try {
    // Worker.close() waits for the active job to finish before resolving, so an
    // in-flight analysis/photo search is not killed mid-pipeline on redeploy.
    await Promise.allSettled([analysisWorker.close(), photoSearchWorker.close()]);
    await services.prisma.$disconnect();
  } catch (error) {
    logger.error({ error }, "workers_shutdown_error");
  } finally {
    logger.info("workers_shutdown_complete");
    process.exit(0);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
