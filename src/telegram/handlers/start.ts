import { CB } from "../constants.js";
import type { MyContext } from "../context.js";
import { backMenuKeyboard, consentKeyboard } from "../keyboards/main-menu.js";
import { t } from "../locales/index.js";
import { editOrSendHtml, renderMainMenu, sendHtml } from "./helpers.js";

export function registerStartHandlers(bot: import("grammy").Bot<MyContext>) {
  bot.command(["start", "menu"], async (ctx) => {
    if (!ctx.user) return;
    await ctx.services.wizard.clear(ctx.user.id);
    const messages = t(ctx.user.language);
    if (!ctx.user.consentAcceptedAt) {
      await sendHtml(ctx, messages.startNeedsConsent(), consentKeyboard(messages, locale(ctx)));
      return;
    }
    await renderMainMenu(ctx);
  });

  bot.callbackQuery(new RegExp(`^${CB.LANG}:(ru|en)$`), async (ctx) => {
    if (!ctx.user || !ctx.match?.[1]) return;
    ctx.user = await ctx.services.users.updateLanguage(ctx.user.id, ctx.match[1] as "ru" | "en");
    const messages = t(ctx.user.language);
    await ctx.answerCallbackQuery();
    if (!ctx.user.consentAcceptedAt) {
      await editOrSendHtml(
        ctx,
        messages.startNeedsConsent(),
        consentKeyboard(messages, locale(ctx))
      );
      return;
    }
    await sendHtml(ctx, messages.languageUpdated(ctx.user.language));
  });

  bot.callbackQuery(CB.ACCEPT_RULES, async (ctx) => {
    if (!ctx.user) return;
    ctx.user = await ctx.services.users.acceptConsent(
      ctx.user.id,
      ctx.user.language as "ru" | "en"
    );
    await ctx.answerCallbackQuery();
    await renderMainMenu(ctx);
  });

  bot.callbackQuery(CB.BACK_MAIN, async (ctx) => {
    if (!ctx.user) return;
    await ctx.services.wizard.clear(ctx.user.id);
    await ctx.answerCallbackQuery();
    await renderMainMenu(ctx);
  });

  bot.callbackQuery("cap", async (ctx) => {
    const messages = t(ctx.user?.language);
    await ctx.answerCallbackQuery();
    await editOrSendHtml(ctx, messages.capabilities(), backMenuKeyboard(messages));
  });
}

function locale(ctx: MyContext): "ru" | "en" {
  return ctx.user?.language === "en" ? "en" : "ru";
}
