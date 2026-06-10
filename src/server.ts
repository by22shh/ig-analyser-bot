import { shutdownObservability } from "./config/observability.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { createServices } from "./modules/container.js";
import { createBot } from "./telegram/bot.js";
import { configureCommands } from "./telegram/commands.js";
import { createApp } from "./app.js";

const services = createServices();
await services.payments.ensureCatalog();
const bot = createBot(services);
const app = createApp({ services, bot });

// Register the Telegram "/" command menu so the bot's commands are discoverable.
// Guarded by a real token: the dev fallback token would 404 against the API.
if (env.TELEGRAM_BOT_TOKEN) {
  await configureCommands(bot);
}

if (env.TELEGRAM_USE_LONG_POLLING) {
  bot.start();
  logger.info("telegram_long_polling_started");
} else if (env.TELEGRAM_WEBHOOK_URL && env.TELEGRAM_BOT_TOKEN) {
  // Required before handleUpdate() can run in webhook mode: grammy throws
  // "Bot not initialized!" otherwise. (Long polling inits inside bot.start().)
  await bot.init();
  await bot.api.setWebhook(env.TELEGRAM_WEBHOOK_URL, {
    ...(env.TELEGRAM_WEBHOOK_SECRET ? { secret_token: env.TELEGRAM_WEBHOOK_SECRET } : {})
  });
  logger.info({ url: env.TELEGRAM_WEBHOOK_URL }, "telegram_webhook_set");
}

const port = env.PORT ?? 3000;
await app.listen({ port, host: "0.0.0.0" });
logger.info({ port }, "server_started");

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "server_shutting_down");
  try {
    if (env.TELEGRAM_USE_LONG_POLLING) await bot.stop();
    await app.close();
    await services.prisma.$disconnect();
  } catch (error) {
    logger.error({ error }, "server_shutdown_error");
  } finally {
    await shutdownObservability();
    logger.info("server_shutdown_complete");
    process.exit(0);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
