import { shutdownObservability } from "./config/observability.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { createServices } from "./modules/container.js";
import { createBot } from "./telegram/bot.js";
import { configureCommands } from "./telegram/commands.js";
import { setupTelegramWebhook } from "./telegram/webhook.js";
import { createApp } from "./app.js";

const services = createServices();
await services.payments.ensureCatalog();
const bot = createBot(services);
const app = createApp({ services, bot });

const port = env.PORT ?? 3000;
await app.listen({ port, host: "0.0.0.0" });
logger.info({ port }, "server_started");

void startTelegramRuntime();

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

async function startTelegramRuntime(): Promise<void> {
  if (env.TELEGRAM_USE_LONG_POLLING) {
    void bot.start().catch((error) => logger.error({ error }, "telegram_long_polling_failed"));
    logger.info("telegram_long_polling_started");
    return;
  }

  if (!env.TELEGRAM_BOT_TOKEN) return;

  await runTelegramStartupTask("telegram_configure_commands", () => configureCommands(bot));

  if (env.TELEGRAM_WEBHOOK_URL) {
    await runTelegramStartupTask("telegram_setup_webhook", async () => {
      await setupTelegramWebhook(bot, env.TELEGRAM_WEBHOOK_URL, env.TELEGRAM_WEBHOOK_SECRET);
      logger.info({ url: env.TELEGRAM_WEBHOOK_URL }, "telegram_webhook_set");
    });
  }
}

async function runTelegramStartupTask(name: string, task: () => Promise<void>): Promise<void> {
  try {
    await withStartupTimeout(task(), 15_000, name);
  } catch (error) {
    logger.warn({ error }, `${name}_failed`);
  }
}

async function withStartupTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  name: string
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${name} timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
        timeout.unref?.();
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
