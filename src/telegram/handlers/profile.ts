import { env } from "../../config/env.js";
import { CB } from "../constants.js";
import type { MyContext } from "../context.js";
import { backMenuKeyboard, helpKeyboard, settingsKeyboard } from "../keyboards/main-menu.js";
import { packageKeyboard, paymentMethodsKeyboard } from "../keyboards/payments.js";
import { t } from "../locales/index.js";
import { sendHtml } from "./helpers.js";

export function registerProfileHandlers(bot: import("grammy").Bot<MyContext>) {
  bot.command(["balance", "credits"], async (ctx) => showBalance(ctx));
  bot.command(["buy", "topup"], async (ctx) => showPaywall(ctx));
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
    await ctx.services.users.deleteMe(ctx.user.id);
    await sendHtml(ctx, t(ctx.user.language).deleteMeDone());
  });

  bot.callbackQuery(CB.PROFILE, async (ctx) => {
    if (!ctx.user) return;
    const messages = t(ctx.user.language);
    const stats = await ctx.services.users.profileStats(ctx.user.id);
    const snapshot = await ctx.services.credits.snapshot(ctx.user.id);
    await ctx.answerCallbackQuery();
    await sendHtml(
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
      backMenuKeyboard(messages)
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
    await ctx.answerCallbackQuery();
    await sendHtml(ctx, t(ctx.user.language).languageUpdated(ctx.user.language));
    await showSettings(ctx);
  });

  bot.callbackQuery(new RegExp(`^${CB.SET_EXPORT}:(pdf|markdown|html)$`), async (ctx) => {
    if (!ctx.user || !ctx.match?.[1]) return;
    await ctx.services.users.updateExportFormat(
      ctx.user.id,
      ctx.match[1] as "pdf" | "markdown" | "html"
    );
    await ctx.answerCallbackQuery();
    await sendHtml(ctx, t(ctx.user.language).settingsUpdated());
    await showSettings(ctx);
  });

  bot.callbackQuery(new RegExp(`^${CB.SET_RETENTION}:([0-9]+)$`), async (ctx) => {
    if (!ctx.user || !ctx.match?.[1]) return;
    await ctx.services.users.updateReportRetention(ctx.user.id, Number(ctx.match[1]));
    await ctx.answerCallbackQuery();
    await sendHtml(ctx, t(ctx.user.language).settingsUpdated());
    await showSettings(ctx);
  });
}

async function showBalance(ctx: MyContext) {
  if (!ctx.user) return;
  const messages = t(ctx.user.language);
  const snapshot = await ctx.services.credits.snapshot(ctx.user.id);
  await sendHtml(
    ctx,
    messages.balance({
      totalUnits: snapshot.balanceUnits,
      purchasedUnits: snapshot.purchasedUnits,
      grantedUnits: snapshot.grantedUnits,
      photoSearchEnabled: env.FEATURE_PHOTO_SEARCH
    }),
    paymentMethodsKeyboard(messages)
  );
}

async function showPaywall(ctx: MyContext) {
  if (!ctx.user) return;
  const messages = t(ctx.user.language);
  await ctx.services.payments.ensureCatalog();
  if (env.FEATURE_TELEGRAM_STARS && !env.FEATURE_YOOKASSA_PAYMENTS) {
    await sendHtml(
      ctx,
      messages.starsIntro(),
      packageKeyboard(messages, "telegram_stars", ctx.services.payments.packages("telegram_stars"))
    );
    return;
  }
  if (!env.FEATURE_TELEGRAM_STARS && env.FEATURE_YOOKASSA_PAYMENTS) {
    await sendHtml(
      ctx,
      messages.yookassaIntro(env.YOOKASSA_TEST_MODE),
      packageKeyboard(messages, "yookassa", ctx.services.payments.packages("yookassa"))
    );
    return;
  }
  if (!env.FEATURE_TELEGRAM_STARS && !env.FEATURE_YOOKASSA_PAYMENTS) {
    await sendHtml(ctx, messages.paymentMethodUnavailable(), backMenuKeyboard(messages));
    return;
  }
  await sendHtml(
    ctx,
    messages.paywallIntro(env.TELEGRAM_STARS_TEST_MODE || env.YOOKASSA_TEST_MODE),
    paymentMethodsKeyboard(messages)
  );
}

async function showSettings(ctx: MyContext) {
  if (!ctx.user) return;
  const messages = t(ctx.user.language);
  const stats = await ctx.services.users.profileStats(ctx.user.id);
  await sendHtml(
    ctx,
    messages.settings({
      language: ctx.user.language,
      exportFormat: stats.settings?.defaultExportFormat ?? "pdf",
      retentionDays: stats.settings?.reportRetentionDays ?? env.REPORT_RETENTION_DAYS ?? 30
    }),
    settingsKeyboard(messages)
  );
}

async function showHelp(ctx: MyContext) {
  const messages = t(ctx.user?.language);
  await sendHtml(
    ctx,
    messages.help(env.SUPPORT_URL, env.TOS_URL, env.PRIVACY_URL),
    helpKeyboard(messages)
  );
}
