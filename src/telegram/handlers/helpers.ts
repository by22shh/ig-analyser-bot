import type { InlineKeyboard } from "grammy";
import { env } from "../../config/env.js";
import type { MyContext } from "../context.js";
import { chunkText } from "../formatters/chunks.js";
import { mainMenuKeyboard } from "../keyboards/main-menu.js";
import { t } from "../locales/index.js";

export async function sendHtml(ctx: MyContext, text: string, keyboard?: InlineKeyboard) {
  const chunks = chunkText(text);
  for (let index = 0; index < chunks.length; index += 1) {
    await ctx.reply(chunks[index] ?? "", {
      parse_mode: "HTML",
      reply_markup: index === chunks.length - 1 ? keyboard : undefined,
      link_preview_options: { is_disabled: true }
    });
  }
}

/**
 * Updates the message a button is attached to instead of stacking a new one.
 * Editing keeps inline navigation (menu → profile → settings …) in a single
 * message and prevents stale keyboards from piling up in the chat.
 *
 * Falls back to {@link sendHtml} when there is no callback message to edit, when
 * the content spans multiple chunks (Telegram edits are single-message), or when
 * the edit fails because the original message can't be edited (it was a
 * document, is too old, or was deleted). A "message is not modified" error means
 * the content is already current and is treated as success.
 */
export async function editOrSendHtml(ctx: MyContext, text: string, keyboard?: InlineKeyboard) {
  const chunks = chunkText(text);
  if (ctx.callbackQuery && chunks.length === 1) {
    try {
      await ctx.editMessageText(chunks[0] ?? "", {
        parse_mode: "HTML",
        reply_markup: keyboard,
        link_preview_options: { is_disabled: true }
      });
      return;
    } catch (error) {
      if (isMessageNotModified(error)) return;
      // Fall through to sending a fresh message.
    }
  }
  await sendHtml(ctx, text, keyboard);
}

function isMessageNotModified(error: unknown): boolean {
  const description =
    error && typeof error === "object" && "description" in error
      ? String((error as { description?: unknown }).description ?? "")
      : error instanceof Error
        ? error.message
        : "";
  return description.includes("message is not modified");
}

export async function renderMainMenu(ctx: MyContext) {
  if (!ctx.user) return;
  const messages = t(ctx.user.language);
  const snapshot = await ctx.services.credits.snapshot(ctx.user.id);
  const bonusCredits = env.WELCOME_BONUS_CREDITS ?? 0;
  // Show the welcome-bonus line only while the user still holds granted credit
  // and has never purchased — it self-clears once they spend it or top up.
  const showBonus =
    bonusCredits > 0 &&
    snapshot.purchasedUnits === 0 &&
    snapshot.grantedUnits > 0 &&
    snapshot.balanceUnits > 0;
  await editOrSendHtml(
    ctx,
    messages.welcome({
      totalUnits: snapshot.balanceUnits,
      purchasedUnits: snapshot.purchasedUnits,
      grantedUnits: snapshot.grantedUnits,
      language: ctx.user.language,
      photoSearchEnabled: env.FEATURE_PHOTO_SEARCH,
      influencerEnabled: env.FEATURE_INFLUENCER_MODE,
      hrEnabled: env.FEATURE_HR_MODE,
      osintEnabled: env.FEATURE_OSINT_COMPLIANCE_MODE,
      welcomeBonusCredits: showBonus ? bonusCredits : undefined
    }),
    mainMenuKeyboard(messages, ctx.services.users.isAdmin(ctx.user))
  );
}
