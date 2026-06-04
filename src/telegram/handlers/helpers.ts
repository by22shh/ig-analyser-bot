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

export async function renderMainMenu(ctx: MyContext) {
  if (!ctx.user) return;
  const messages = t(ctx.user.language);
  const snapshot = await ctx.services.credits.snapshot(ctx.user.id);
  await sendHtml(
    ctx,
    messages.welcome({
      totalUnits: snapshot.balanceUnits,
      purchasedUnits: snapshot.purchasedUnits,
      grantedUnits: snapshot.grantedUnits,
      language: ctx.user.language,
      photoSearchEnabled: env.FEATURE_PHOTO_SEARCH
    }),
    mainMenuKeyboard(messages, ctx.services.users.isAdmin(ctx.user))
  );
}
