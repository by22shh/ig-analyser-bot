import type { Bot } from "grammy";
import type { MyContext } from "./context.js";

export const TELEGRAM_ALLOWED_UPDATES = [
  "message",
  "callback_query",
  "pre_checkout_query"
] as const;

export async function setupTelegramWebhook(
  bot: Pick<Bot<MyContext>, "init" | "api">,
  url: string,
  secretToken?: string
): Promise<void> {
  await bot.init();
  await bot.api.setWebhook(url, {
    allowed_updates: [...TELEGRAM_ALLOWED_UPDATES],
    ...(secretToken ? { secret_token: secretToken } : {})
  });
}
