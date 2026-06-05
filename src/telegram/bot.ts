import { Bot } from "grammy";
import { env } from "../config/env.js";
import type { Services } from "../modules/container.js";
import type { MyContext } from "./context.js";
import { registerHandlers } from "./handlers/index.js";
import { consentGate } from "./middleware/consent-gate.js";
import { subscriptionGate } from "./middleware/subscription-gate.js";
import { updateDedup } from "./middleware/update-dedup.js";
import { userContext } from "./middleware/user-context.js";

export function createBot(services: Services): Bot<MyContext> {
  const token = env.TELEGRAM_BOT_TOKEN || "000000:test";
  const bot = new Bot<MyContext>(token, {
    client: { apiRoot: env.TELEGRAM_API_ROOT }
  });

  bot.use(async (ctx, next) => {
    ctx.services = services;
    await next();
  });
  bot.use(updateDedup);
  bot.use(userContext);
  bot.use(consentGate);
  bot.use(subscriptionGate);
  registerHandlers(bot);

  bot.catch((err) => {
    services.prisma.auditLog
      .create({
        data: {
          action: "telegram_error",
          entityType: "update",
          metadata: { error: err.error instanceof Error ? err.error.message : String(err.error) }
        }
      })
      .catch(() => undefined);
  });

  return bot;
}
