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

/**
 * Best-effort send that returns the new message id (or undefined on failure), so
 * a follow-up can edit the same message instead of stacking new ones.
 */
export async function safeNotifyEditable(
  bot: Bot<MyContext> | undefined,
  chatId: number,
  text: string,
  onError?: (error: unknown) => void
): Promise<number | undefined> {
  if (!bot) return undefined;
  try {
    const message = await bot.api.sendMessage(chatId, text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true }
    });
    return message.message_id;
  } catch (error) {
    onError?.(error);
    return undefined;
  }
}

/**
 * Edits an existing best-effort message in place when `messageId` is known,
 * otherwise sends a fresh one. Used to keep multi-stage progress in a single
 * message. Never throws: a delivery/edit hiccup must not fail a paid worker.
 */
export async function safeEditOrNotify(
  bot: Bot<MyContext> | undefined,
  chatId: number,
  messageId: number | undefined,
  text: string,
  onError?: (error: unknown) => void
): Promise<number | undefined> {
  if (!bot) return messageId;
  if (messageId != null) {
    try {
      await bot.api.editMessageText(chatId, messageId, text, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true }
      });
      return messageId;
    } catch {
      // Fall back to sending a fresh message below.
    }
  }
  return safeNotifyEditable(bot, chatId, text, onError);
}
