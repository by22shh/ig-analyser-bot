import type { Bot } from "grammy";
import type { MyContext } from "../../telegram/context.js";

/**
 * Sends an HTML Telegram message from a worker. Throws on a delivery failure;
 * callers on a paid success path must use {@link safeNotify} instead.
 */
export async function notify(
  bot: Bot<MyContext> | undefined,
  chatId: number,
  text: string,
  replyMarkup?: unknown
): Promise<void> {
  if (!bot) return;
  await bot.api.sendMessage(chatId, text, {
    parse_mode: "HTML",
    reply_markup: replyMarkup as never,
    link_preview_options: { is_disabled: true }
  });
}

/**
 * Best-effort variant of {@link notify}. A delivery failure (user blocked the
 * bot, 429/5xx, network blip) must never throw out of a paid worker's success
 * path: otherwise the job would fail and a retry would re-run the already-paid
 * pipeline (re-billing Apify/OpenRouter/FaceCheck). Returns normally on failure
 * and reports the error via `onError`.
 */
export async function safeNotify(
  bot: Bot<MyContext> | undefined,
  chatId: number,
  text: string,
  onError?: (error: unknown) => void,
  replyMarkup?: unknown
): Promise<void> {
  try {
    await notify(bot, chatId, text, replyMarkup);
  } catch (error) {
    onError?.(error);
  }
}
