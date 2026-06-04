import { randomUUID } from "node:crypto";
import { InlineKeyboard } from "grammy";
import { env } from "../../config/env.js";
import { CB, type AnalysisMode } from "../constants.js";
import type { MyContext } from "../context.js";
import { InsufficientCreditsError } from "../../modules/billing/credits.service.js";
import { MODE_COST_UNITS } from "../../modules/billing/packages.js";
import { normalizeInstagramUsername } from "../../modules/instagram/normalize.js";
import {
  confirmAnalysisKeyboard,
  modeKeyboard,
  osintLawfulBasisKeyboard
} from "../keyboards/analysis.js";
import { backMenuKeyboard } from "../keyboards/main-menu.js";
import { paymentMethodsKeyboard } from "../keyboards/payments.js";
import { t } from "../locales/index.js";
import { editOrSendHtml, sendHtml } from "./helpers.js";

type AnalyzePayload = {
  username?: string;
  mode?: AnalysisMode;
  targetPosition?: string;
  requestId?: string;
  lawfulBasisAccepted?: boolean;
};

export function registerAnalyzeHandlers(bot: import("grammy").Bot<MyContext>) {
  bot.command("analyze", async (ctx) => {
    if (!ctx.user) return;
    await ctx.services.wizard.set(ctx.user.id, "waiting_username");
    await sendHtml(ctx, t(ctx.user.language).askUsername(), cancelKeyboard(ctx));
  });

  bot.callbackQuery(CB.ANALYZE, async (ctx) => {
    if (!ctx.user) return;
    await ctx.answerCallbackQuery();
    await ctx.services.wizard.set(ctx.user.id, "waiting_username");
    await editOrSendHtml(ctx, t(ctx.user.language).askUsername(), cancelKeyboard(ctx));
  });

  bot.callbackQuery(
    new RegExp(`^${CB.MODE}:(${["standard", "influencer", "hr", "osint_compliance"].join("|")})$`),
    async (ctx) => {
      if (!ctx.user || !ctx.match?.[1]) return;
      const mode = ctx.match[1] as AnalysisMode;
      const messages = t(ctx.user.language);
      const state = await ctx.services.wizard.get<AnalyzePayload>(ctx.user.id);
      if (!state?.payload.username) return;
      if (mode === "osint_compliance" && !ctx.services.users.isCompliance(ctx.user)) {
        await ctx.answerCallbackQuery({ text: messages.osintRestricted(), show_alert: true });
        return;
      }
      if (!isModeAvailable(mode, ctx)) {
        await ctx.answerCallbackQuery({ text: messages.modeUnavailable(), show_alert: true });
        return;
      }
      await ctx.answerCallbackQuery();
      if (mode === "hr") {
        await ctx.services.wizard.set(ctx.user.id, "waiting_hr_position", {
          ...state.payload,
          mode
        });
        await editOrSendHtml(ctx, messages.askHrPosition(), cancelKeyboard(ctx));
        return;
      }
      if (mode === "osint_compliance") {
        await ctx.services.wizard.set(ctx.user.id, "confirming_osint", {
          ...state.payload,
          mode,
          requestId: randomUUID(),
          lawfulBasisAccepted: false
        });
        await editOrSendHtml(
          ctx,
          messages.askOsintLawfulBasis(),
          osintLawfulBasisKeyboard(messages)
        );
        return;
      }
      await showConfirm(ctx, { ...state.payload, mode });
    }
  );

  bot.callbackQuery(CB.OSINT_LAWFUL_BASIS, async (ctx) => {
    if (!ctx.user) return;
    const messages = t(ctx.user.language);
    const state = await ctx.services.wizard.get<AnalyzePayload>(ctx.user.id);
    if (state?.state !== "confirming_osint" || !state.payload.username) return;
    if (!ctx.services.users.isCompliance(ctx.user) || !isModeAvailable("osint_compliance", ctx)) {
      await ctx.answerCallbackQuery({ text: messages.osintRestricted(), show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    await showConfirm(ctx, {
      ...state.payload,
      mode: "osint_compliance",
      lawfulBasisAccepted: true
    });
  });

  bot.callbackQuery(new RegExp(`^${CB.RUN}:([A-Za-z0-9-]+)$`), async (ctx) => {
    if (!ctx.user || !ctx.chat) return;
    const messages = t(ctx.user.language);
    const requestId = ctx.match?.[1];
    const state = await ctx.services.wizard.get<AnalyzePayload>(ctx.user.id);
    if (!state?.payload.username || !state.payload.mode || !state.payload.requestId) return;
    if (requestId !== state.payload.requestId) {
      await ctx.answerCallbackQuery({ text: messages.staleConfirmation(), show_alert: true });
      return;
    }
    if (!isModeAvailable(state.payload.mode, ctx)) {
      await ctx.answerCallbackQuery({ text: messages.modeUnavailable(), show_alert: true });
      return;
    }
    if (
      state.payload.mode === "osint_compliance" &&
      (!ctx.services.users.isCompliance(ctx.user) || !state.payload.lawfulBasisAccepted)
    ) {
      await ctx.answerCallbackQuery({ text: messages.osintRestricted(), show_alert: true });
      return;
    }
    try {
      const result = await ctx.services.analysis.startAnalysis({
        userId: ctx.user.id,
        chatId: ctx.chat.id,
        inputType: "username",
        username: state.payload.username,
        mode: state.payload.mode,
        language: ctx.user.language === "en" ? "en" : "ru",
        targetPosition: state.payload.targetPosition,
        idempotencyKey: `analysis:${ctx.user.id}:${state.payload.requestId}`
      });
      await ctx.services.wizard.clear(ctx.user.id);
      await ctx.answerCallbackQuery();
      await editOrSendHtml(
        ctx,
        result.reused
          ? messages.jobAlreadyQueued(state.payload.username)
          : messages.jobQueued(state.payload.username)
      );
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        await ctx.answerCallbackQuery();
        await editOrSendHtml(
          ctx,
          messages.insufficientCredits(error),
          paymentMethodsKeyboard(messages)
        );
        return;
      }
      throw error;
    }
  });

  bot.on("message:text", async (ctx, next) => {
    if (!ctx.user || !ctx.message?.text || ctx.message.text.startsWith("/")) {
      await next();
      return;
    }
    const messages = t(ctx.user.language);
    const state = await ctx.services.wizard.get<AnalyzePayload>(ctx.user.id);
    if (state?.state === "waiting_username") {
      try {
        const username = normalizeInstagramUsername(ctx.message.text);
        await ctx.services.wizard.set(ctx.user.id, "selecting_mode", { username });
        await sendHtml(
          ctx,
          messages.chooseMode(username),
          modeKeyboard(messages, ctx.services.users.isCompliance(ctx.user))
        );
      } catch {
        await sendHtml(ctx, messages.invalidUsername(), cancelKeyboard(ctx));
      }
      return;
    }
    if (state?.state === "waiting_hr_position") {
      const targetPosition = ctx.message.text.trim().slice(0, 120);
      await showConfirm(ctx, { ...state.payload, mode: "hr", targetPosition });
      return;
    }
    // Intentional UX (kept per audit decision): with no active wizard step, a
    // consented user can send a bare Instagram username (any space-free token)
    // to jump straight into mode selection. Flows like report-chat set a wizard
    // state, so they take precedence over this free-text fallback.
    if (!state && ctx.user.consentAcceptedAt) {
      try {
        const username = normalizeInstagramUsername(ctx.message.text);
        await ctx.services.wizard.set(ctx.user.id, "selecting_mode", { username });
        await sendHtml(
          ctx,
          messages.chooseMode(username),
          modeKeyboard(messages, ctx.services.users.isCompliance(ctx.user))
        );
        return;
      } catch {
        // Not a username: let other text handlers or future fallbacks process it.
      }
    }
    await next();
  });

  bot.callbackQuery(CB.CANCEL, async (ctx) => {
    if (!ctx.user) return;
    await ctx.services.wizard.clear(ctx.user.id);
    await ctx.answerCallbackQuery();
    await editOrSendHtml(
      ctx,
      t(ctx.user.language).cancelled(),
      backMenuKeyboard(t(ctx.user.language))
    );
  });
}

async function showConfirm(ctx: MyContext, payload: AnalyzePayload) {
  if (!ctx.user || !payload.username || !payload.mode) return;
  const messages = t(ctx.user.language);
  const requestId = payload.requestId ?? randomUUID();
  const nextPayload = { ...payload, requestId };
  await ctx.services.wizard.set(ctx.user.id, "confirming_analysis", nextPayload);
  await editOrSendHtml(
    ctx,
    messages.confirmAnalysis({
      username: payload.username,
      mode: payload.mode,
      costUnits: MODE_COST_UNITS[payload.mode]
    }),
    confirmAnalysisKeyboard(messages, payload.mode, requestId)
  );
}

function cancelKeyboard(ctx: MyContext) {
  const messages = t(ctx.user?.language);
  return new InlineKeyboard()
    .text(messages.buttons.cancel, CB.CANCEL)
    .text(messages.buttons.menu, CB.BACK_MAIN);
}

function isModeAvailable(mode: AnalysisMode, ctx: MyContext): boolean {
  if (mode === "standard") return true;
  if (mode === "influencer") return env.FEATURE_INFLUENCER_MODE;
  if (mode === "hr") return env.FEATURE_HR_MODE;
  if (mode === "osint_compliance") {
    return (
      env.FEATURE_OSINT_COMPLIANCE_MODE &&
      Boolean(ctx.user && ctx.services.users.isCompliance(ctx.user))
    );
  }
  return false;
}
