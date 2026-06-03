import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { createServices } from "./modules/container.js";
import { createBot } from "./telegram/bot.js";
import { startAnalysisWorker } from "./jobs/workers/analysis.worker.js";
import { startPhotoSearchWorker } from "./jobs/workers/photo-search.worker.js";
import { startRetentionLoop } from "./jobs/workers/retention.worker.js";

const services = createServices();
const bot = env.TELEGRAM_BOT_TOKEN ? createBot(services) : undefined;

startAnalysisWorker({
  prisma: services.prisma,
  bot,
  instagram: services.instagram,
  llm: services.llm,
  reportService: services.reports
});

startPhotoSearchWorker({
  prisma: services.prisma,
  bot,
  facecheck: services.facecheck
});

startRetentionLoop(services);

logger.info("workers_started");
