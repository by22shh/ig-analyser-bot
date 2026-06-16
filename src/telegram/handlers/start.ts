import { CB } from "../constants.js";
import type { MyContext } from "../context.js";
import {
  backMenuKeyboard,
  consentKeyboard,
  declinedKeyboard,
  languageKeyboard
} from "../keyboards/main-menu.js";
import { t } from "../locales/index.js";
import {
  proceedAfterConsent,
  renderSubscriptionGate,
  userIsSubscribed
} from "../middleware/subscription-gate.js";
import { editOrSendHtml, renderMainMenu, sendHtml } from "./helpers.js";

export function registerStartHandlers(bot: import("grammy").Bot<MyContext>) {
  bot.command(["start", "menu"], async (ctx) => {
    if (!ctx.user) return;
    await ctx.services.wizard.clear(ctx.user.id);
    const messages = t(ctx.user.language);
    if (!ctx.user.consentAcceptedAt) {
      // Step 1 of onboarding: language choice (advances to the rules step).
      await sendHtml(ctx, messages.chooseLanguage(), languageKeyboard());
      return;
    }
    // Already onboarded: show the menu, or the subscription gate if they left.
    await proceedAfterConsent(ctx, { force: true });
  });

  bot.callbackQuery(new RegExp(`^${CB.LANG}:(ru|en)$`), async (ctx) => {
    if (!ctx.user || !ctx.match?.[1]) return;
    ctx.user = await ctx.services.users.updateLanguage(ctx.user.id, ctx.match[1] as "ru" | "en");
    const messages = t(ctx.user.language);
    await ctx.answerCallbackQuery();
    if (!ctx.user.consentAcceptedAt) {
      // Step 2: show the rules in the chosen language.
      await editOrSendHtml(ctx, messages.startNeedsConsent(), consentKeyboard(messages));
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
    // Step 3: enforce channel subscription (or show the menu when satisfied).
    await proceedAfterConsent(ctx, { force: true });
  });

  bot.callbackQuery(CB.DECLINE_RULES, async (ctx) => {
    if (!ctx.user) return;
    const messages = t(ctx.user.language);
    await ctx.answerCallbackQuery();
    // Soft block: consent stays unset, so the rest of the bot remains gated and
    // /start (or "Start over") reopens the flow.
    await editOrSendHtml(ctx, messages.consentDeclined(), declinedKeyboard(messages));
  });

  bot.callbackQuery(CB.RESTART_ONBOARDING, async (ctx) => {
    if (!ctx.user) return;
    const messages = t(ctx.user.language);
    await ctx.answerCallbackQuery();
    await editOrSendHtml(ctx, messages.chooseLanguage(), languageKeyboard());
  });

  bot.callbackQuery(CB.CHECK_SUB, async (ctx) => {
    if (!ctx.user) return;
    await ctx.answerCallbackQuery();
    // Force a fresh check so the user gets instant feedback after subscribing.
    if (await userIsSubscribed(ctx, { force: true })) {
      await renderMainMenu(ctx);
      return;
    }
    await renderSubscriptionGate(ctx, { note: true });
  });

  bot.callbackQuery(CB.BACK_MAIN, async (ctx) => {
    if (!ctx.user) return;
    await ctx.services.wizard.clear(ctx.user.id);
    await ctx.answerCallbackQuery();
    await renderMainMenu(ctx);
  });

  bot.callbackQuery(CB.CAPABILITIES, async (ctx) => {
    const messages = t(ctx.user?.language);
    await ctx.answerCallbackQuery();
    await editOrSendHtml(ctx, messages.capabilities(), backMenuKeyboard(messages));
  });
}
