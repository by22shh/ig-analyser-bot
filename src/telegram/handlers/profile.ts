import { InlineKeyboard } from "grammy";
import { env } from "../../config/env.js";
import { CB } from "../constants.js";
import type { MyContext } from "../context.js";
import {
  backMenuKeyboard,
  helpKeyboard,
  profileKeyboard,
  settingsKeyboard
} from "../keyboards/main-menu.js";
import { packageKeyboard, paymentMethodsKeyboard } from "../keyboards/payments.js";
import { t } from "../locales/index.js";
import { editOrSendHtml, sendHtml } from "./helpers.js";

export function registerProfileHandlers(bot: import("grammy").Bot<MyContext>) {
  bot.command(["balance", "credits"], async (ctx) => showBalance(ctx));
  bot.command(["buy", "topup"], async (ctx) => showPaywall(ctx));
  bot.command("paysupport", async (ctx) => showPaymentSupport(ctx));
  bot.command("settings", async (ctx) => showSettings(ctx));
  bot.command("help", async (ctx) => showHelp(ctx));
  bot.command("cancel", async (ctx) => {
    if (!ctx.user) return;
    await ctx.services.wizard.clear(ctx.user.id);
    await sendHtml(ctx, t(ctx.user.language).cancelled(), backMenuKeyboard(t(ctx.user.language)));
  });
  bot.command("reset", async (ctx) => {
    if (!ctx.user) return;
    await ctx.services.wizard.clear(ctx.user.id);
    await sendHtml(ctx, t(ctx.user.language).resetDone(), backMenuKeyboard(t(ctx.user.language)));
  });
  bot.command("delete_me", async (ctx) => {
    if (!ctx.user) return;
    const messages = t(ctx.user.language);
    // Destructive + irreversible: require an explicit confirmation tap before
    // anonymizing the account and deleting reports/artifacts.
    await sendHtml(
      ctx,
      messages.deleteMeWarning(),
      new InlineKeyboard()
        .text(messages.buttons.confirmDelete, CB.DELETE_ME_CONFIRM)
        .row()
        .text(messages.buttons.cancel, CB.CANCEL)
        .text(messages.buttons.menu, CB.BACK_MAIN)
    );
  });

  bot.callbackQuery(CB.DELETE_ME_CONFIRM, async (ctx) => {
    if (!ctx.user) return;
    const messages = t(ctx.user.language);
    await ctx.services.users.deleteMe(ctx.user.id);
    await ctx.answerCallbackQuery();
    await editOrSendHtml(ctx, messages.deleteMeDone());
  });

  bot.callbackQuery(CB.PROFILE, async (ctx) => {
    if (!ctx.user) return;
    const messages = t(ctx.user.language);
    const stats = await ctx.services.users.profileStats(ctx.user.id);
    const snapshot = await ctx.services.credits.snapshot(ctx.user.id);
    await ctx.answerCallbackQuery();
    await editOrSendHtml(
      ctx,
      messages.profile({
        name: ctx.user.firstName ?? ctx.user.telegramUsername ?? "user",
        telegramId: String(ctx.user.telegramId),
        language: ctx.user.language,
        totalUnits: snapshot.balanceUnits,
        purchasedUnits: snapshot.purchasedUnits,
        grantedUnits: snapshot.grantedUnits,
        completedReports: stats.completedReports,
        activeJobs: stats.activeJobs,
        retentionDays: stats.settings?.reportRetentionDays ?? 30
      }),
      profileKeyboard(messages)
    );
  });

  bot.callbackQuery(CB.PAYWALL, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showPaywall(ctx);
  });

  bot.callbackQuery(CB.SETTINGS, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showSettings(ctx);
  });

  bot.callbackQuery("help", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showHelp(ctx);
  });

  bot.callbackQuery(new RegExp(`^${CB.SET_LANGUAGE}:(ru|en)$`), async (ctx) => {
    if (!ctx.user || !ctx.match?.[1]) return;
    ctx.user = await ctx.services.users.updateLanguage(ctx.user.id, ctx.match[1] as "ru" | "en");
    await ctx.answerCallbackQuery({ text: t(ctx.user.language).settingsUpdated() });
    await showSettings(ctx);
  });

  bot.callbackQuery(new RegExp(`^${CB.SET_EXPORT}:(pdf|markdown|html)$`), async (ctx) => {
    if (!ctx.user || !ctx.match?.[1]) return;
    await ctx.services.users.updateExportFormat(
      ctx.user.id,
      ctx.match[1] as "pdf" | "markdown" | "html"
    );
    await ctx.answerCallbackQuery({ text: t(ctx.user.language).settingsUpdated() });
    await showSettings(ctx);
  });

  bot.callbackQuery(new RegExp(`^${CB.SET_RETENTION}:([0-9]+)$`), async (ctx) => {
    if (!ctx.user || !ctx.match?.[1]) return;
    await ctx.services.users.updateReportRetention(ctx.user.id, Number(ctx.match[1]));
    await ctx.answerCallbackQuery({ text: t(ctx.user.language).settingsUpdated() });
    await showSettings(ctx);
  });
}

async function showBalance(ctx: MyContext) {
  if (!ctx.user) return;
  const messages = t(ctx.user.language);
  const snapshot = await ctx.services.credits.snapshot(ctx.user.id);
  await editOrSendHtml(
    ctx,
    messages.balance({
      totalUnits: snapshot.balanceUnits,
      purchasedUnits: snapshot.purchasedUnits,
      grantedUnits: snapshot.grantedUnits,
      photoSearchEnabled: env.FEATURE_PHOTO_SEARCH,
      osintEnabled: env.FEATURE_OSINT_COMPLIANCE_MODE
    }),
    paymentMethodsKeyboard(messages)
  );
}

async function showPaywall(ctx: MyContext) {
  if (!ctx.user) return;
  const messages = t(ctx.user.language);
  await ctx.services.payments.ensureCatalog();
  if (env.FEATURE_TELEGRAM_STARS && !env.FEATURE_YOOKASSA_PAYMENTS) {
    await editOrSendHtml(
      ctx,
      messages.starsIntro(),
      packageKeyboard(messages, "telegram_stars", ctx.services.payments.packages("telegram_stars"))
    );
    return;
  }
  if (!env.FEATURE_TELEGRAM_STARS && env.FEATURE_YOOKASSA_PAYMENTS) {
    await editOrSendHtml(
      ctx,
      messages.yookassaIntro(env.YOOKASSA_TEST_MODE),
      packageKeyboard(messages, "yookassa", ctx.services.payments.packages("yookassa"))
    );
    return;
  }
  if (!env.FEATURE_TELEGRAM_STARS && !env.FEATURE_YOOKASSA_PAYMENTS) {
    await editOrSendHtml(ctx, messages.paymentMethodUnavailable(), backMenuKeyboard(messages));
    return;
  }
  await editOrSendHtml(
    ctx,
    messages.paywallIntro(env.TELEGRAM_STARS_TEST_MODE || env.YOOKASSA_TEST_MODE),
    paymentMethodsKeyboard(messages)
  );
}

async function showSettings(ctx: MyContext) {
  if (!ctx.user) return;
  const messages = t(ctx.user.language);
  const stats = await ctx.services.users.profileStats(ctx.user.id);
  const exportFormat = stats.settings?.defaultExportFormat ?? "pdf";
  const retentionDays = stats.settings?.reportRetentionDays ?? env.REPORT_RETENTION_DAYS ?? 30;
  await editOrSendHtml(
    ctx,
    messages.settings({
      language: ctx.user.language,
      exportFormat,
      retentionDays
    }),
    settingsKeyboard(messages, { language: ctx.user.language, exportFormat, retentionDays })
  );
}

async function showHelp(ctx: MyContext) {
  const messages = t(ctx.user?.language);
  await editOrSendHtml(
    ctx,
    messages.help(env.SUPPORT_URL, env.TOS_URL, env.PRIVACY_URL),
    helpKeyboard(messages)
  );
}

async function showPaymentSupport(ctx: MyContext) {
  const messages = t(ctx.user?.language);
  await editOrSendHtml(ctx, messages.paymentSupport(env.SUPPORT_URL), helpKeyboard(messages));
}
