import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { createServices } from "./modules/container.js";
import { createBot } from "./telegram/bot.js";
import { createApp } from "./app.js";

const services = createServices();
await services.payments.ensureCatalog();
const bot = createBot(services);
const app = createApp({ services, bot });

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
