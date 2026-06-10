import { env } from "../../config/env.js";
import { CB } from "../constants.js";
import type { MyContext } from "../context.js";
import { packageKeyboard } from "../keyboards/payments.js";
import { backMenuKeyboard } from "../keyboards/main-menu.js";
import { t } from "../locales/index.js";
import { editOrSendHtml, sendHtml } from "./helpers.js";
import { InlineKeyboard } from "grammy";

export function registerPaymentHandlers(bot: import("grammy").Bot<MyContext>) {
  bot.callbackQuery(CB.PAY_METHOD_STARS, async (ctx) => {
    if (!ctx.user) return;
    const messages = t(ctx.user.language);
    await ctx.answerCallbackQuery();
    if (!env.FEATURE_TELEGRAM_STARS) {
      await sendHtml(ctx, messages.paymentMethodUnavailable(), backMenuKeyboard(messages));
      return;
    }
    await editOrSendHtml(
      ctx,
      messages.starsIntro(),
      packageKeyboard(messages, "telegram_stars", ctx.services.payments.packages("telegram_stars"))
    );
  });

  bot.callbackQuery(CB.PAY_METHOD_YOOKASSA, async (ctx) => {
    if (!ctx.user) return;
    const messages = t(ctx.user.language);
    await ctx.answerCallbackQuery();
    if (!env.FEATURE_YOOKASSA_PAYMENTS) {
      await sendHtml(ctx, messages.paymentMethodUnavailable(), backMenuKeyboard(messages));
      return;
    }
    await editOrSendHtml(
      ctx,
      messages.yookassaIntro(env.YOOKASSA_TEST_MODE),
      packageKeyboard(messages, "yookassa", ctx.services.payments.packages("yookassa"))
    );
  });

  bot.callbackQuery(new RegExp(`^${CB.BUY_STARS}:([a-z_]+)$`), async (ctx) => {
    if (!ctx.user || !ctx.match?.[1]) return;
    await ctx.answerCallbackQuery();
    if (!env.FEATURE_TELEGRAM_STARS) {
      await sendHtml(
        ctx,
        t(ctx.user.language).paymentMethodUnavailable(),
        backMenuKeyboard(t(ctx.user.language))
      );
      return;
    }
    await ctx.services.payments.ensureCatalog();
    const pkg = ctx.services.payments
      .packages("telegram_stars")
      .find((item) => item.code === ctx.match![1]);
    const invoice = await ctx.services.payments.createTelegramStarsInvoice({
      api: ctx.api,
      userId: ctx.user.id,
      telegramUserId: ctx.from!.id,
      chatId: ctx.chat!.id,
      packageCode: ctx.match[1],
      idempotencyKey: paymentIdempotencyKey("stars", ctx, ctx.match[1]),
      title: pkg ? t(ctx.user.language).starsInvoiceTitle(pkg) : undefined,
      description: pkg ? t(ctx.user.language).starsInvoiceDescription(pkg) : undefined
    });
    if (invoice.reused) {
      await sendHtml(
        ctx,
        t(ctx.user.language).starsInvoiceAlreadyPending(),
        backMenuKeyboard(t(ctx.user.language))
      );
    }
  });

  bot.callbackQuery(new RegExp(`^${CB.BUY_YOOKASSA}:([a-z_]+)$`), async (ctx) => {
    if (!ctx.user || !ctx.match?.[1]) return;
    const messages = t(ctx.user.language);
    await ctx.answerCallbackQuery();
    if (!env.FEATURE_YOOKASSA_PAYMENTS) {
      await sendHtml(ctx, messages.paymentMethodUnavailable(), backMenuKeyboard(messages));
      return;
    }
    await ctx.services.payments.ensureCatalog();
    if (env.YOOKASSA_USE_RECEIPTS && !ctx.user.email) {
      await ctx.services.wizard.set(ctx.user.id, "waiting_email", { packageCode: ctx.match[1] });
      await editOrSendHtml(
        ctx,
        messages.askReceiptEmail(),
        new InlineKeyboard()
          .text(messages.buttons.cancel, CB.CANCEL)
          .text(messages.buttons.menu, CB.BACK_MAIN)
      );
      return;
    }
    await createAndSendYooKassaOrder(ctx, ctx.match[1], ctx.user.email ?? undefined);
  });

  bot.on("message:text", async (ctx, next) => {
    if (!ctx.user || !ctx.message?.text || ctx.message.text.startsWith("/")) {
      await next();
      return;
    }
    const state = await ctx.services.wizard.get<{ packageCode?: string }>(ctx.user.id);
    if (state?.state !== "waiting_email") {
      await next();
      return;
    }
    const messages = t(ctx.user.language);
    const email = ctx.message.text.trim().toLowerCase();
    if (!isValidEmail(email)) {
      await sendHtml(
        ctx,
        messages.invalidEmail(),
        new InlineKeyboard()
          .text(messages.buttons.cancel, CB.CANCEL)
          .text(messages.buttons.menu, CB.BACK_MAIN)
      );
      return;
    }
    ctx.user = await ctx.services.users.updateEmail(ctx.user.id, email);
    await sendHtml(ctx, messages.emailSaved(email));
    const packageCode = state.payload.packageCode;
    await ctx.services.wizard.clear(ctx.user.id);
    if (!packageCode) {
      await sendHtml(ctx, messages.paymentMethodUnavailable(), backMenuKeyboard(messages));
      return;
    }
    await createAndSendYooKassaOrder(ctx, packageCode, email);
  });

  bot.on("pre_checkout_query", async (ctx) => {
    const query = ctx.preCheckoutQuery;
    if (!query) return;
    const result = await ctx.services.payments.handleTelegramPreCheckout({
      preCheckoutQueryId: query.id,
      telegramUserId: query.from.id,
      currency: query.currency,
      totalAmount: query.total_amount,
      invoicePayload: query.invoice_payload,
      raw: query as never,
      payloadInvalidMessage: t(ctx.user?.language).preCheckoutPayloadInvalid(),
      paymentInvalidMessage: t(ctx.user?.language).preCheckoutPaymentInvalid()
    });
    await ctx.api.answerPreCheckoutQuery(
      query.id,
      result.ok,
      result.errorMessage ? { error_message: result.errorMessage } : undefined
    );
  });

  bot.on("message:successful_payment", async (ctx) => {
    if (!ctx.message?.successful_payment || !ctx.from || !ctx.chat) return;
    const payment = ctx.message.successful_payment;
    const result = await ctx.services.payments.handleTelegramSuccessfulPayment({
      telegramUserId: ctx.from.id,
      chatId: ctx.chat.id,
      messageId: ctx.message.message_id,
      currency: payment.currency,
      totalAmount: payment.total_amount,
      invoicePayload: payment.invoice_payload,
      telegramPaymentChargeId: payment.telegram_payment_charge_id,
      providerPaymentChargeId: payment.provider_payment_charge_id,
      raw: payment as never
    });
    if (result.processed) {
      const messages = t(result.language === "en" ? "en" : ctx.user?.language);
      await sendHtml(
        ctx,
        messages.paymentSuccess(result.creditsUnitsGranted ?? 0, result.balanceUnits ?? 0),
        backMenuKeyboard(messages)
      );
    }
  });
}

async function createAndSendYooKassaOrder(ctx: MyContext, packageCode: string, userEmail?: string) {
  if (!ctx.user || !ctx.chat) return;
  const messages = t(ctx.user.language);
  await ctx.services.payments.ensureCatalog();
  const order = await ctx.services.payments.createYooKassaOrder({
    userId: ctx.user.id,
    chatId: ctx.chat.id,
    packageCode,
    userEmail,
    idempotencyKey: paymentIdempotencyKey("yk", ctx, packageCode)
  });
  await editOrSendHtml(
    ctx,
    messages.yookassaPaymentCreated(order.amountMinor),
    order.confirmationUrl
      ? new InlineKeyboard()
          .url(messages.buttons.pay, order.confirmationUrl)
          .row()
          .text(messages.buttons.menu, CB.BACK_MAIN)
      : backMenuKeyboard(messages)
  );
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value) && value.length <= 254;
}

function paymentIdempotencyKey(
  provider: "stars" | "yk",
  ctx: MyContext,
  packageCode: string
): string {
  return `${provider}:${ctx.user!.id}:${packageCode}:update:${ctx.update.update_id}`;
}
