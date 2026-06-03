import { randomUUID } from "node:crypto";
import { InlineKeyboard } from "grammy";
import { CB, type AnalysisMode } from "../constants.js";
import type { MyContext } from "../context.js";
import { InsufficientCreditsError } from "../../modules/billing/credits.service.js";
import { MODE_COST_UNITS } from "../../modules/billing/packages.js";
import { normalizeInstagramUsername } from "../../modules/instagram/normalize.js";
import { confirmAnalysisKeyboard, modeKeyboard } from "../keyboards/analysis.js";
import { backMenuKeyboard } from "../keyboards/main-menu.js";
import { paymentMethodsKeyboard } from "../keyboards/payments.js";
import { t } from "../locales/index.js";
import { sendHtml } from "./helpers.js";

type AnalyzePayload = {
  username?: string;
  mode?: AnalysisMode;
  targetPosition?: string;
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
    await sendHtml(ctx, t(ctx.user.language).askUsername(), cancelKeyboard(ctx));
  });

  bot.callbackQuery(new RegExp(`^${CB.MODE}:(${["standard", "influencer", "hr", "osint_compliance"].join("|")})$`), async (ctx) => {
    if (!ctx.user || !ctx.match?.[1]) return;
    const mode = ctx.match[1] as AnalysisMode;
    const messages = t(ctx.user.language);
    const state = await ctx.services.wizard.get<AnalyzePayload>(ctx.user.id);
    if (!state?.payload.username) return;
    if (mode === "osint_compliance" && !ctx.services.users.isCompliance(ctx.user)) {
      await ctx.answerCallbackQuery({ text: messages.osintRestricted(), show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    if (mode === "hr") {
      await ctx.services.wizard.set(ctx.user.id, "waiting_hr_position", { ...state.payload, mode });
      await sendHtml(ctx, messages.askHrPosition(), cancelKeyboard(ctx));
      return;
    }
    await showConfirm(ctx, { ...state.payload, mode });
  });

  bot.callbackQuery(new RegExp(`^${CB.RUN}:`), async (ctx) => {
    if (!ctx.user || !ctx.chat) return;
    const messages = t(ctx.user.language);
    const state = await ctx.services.wizard.get<AnalyzePayload>(ctx.user.id);
    if (!state?.payload.username || !state.payload.mode) return;
    try {
      await ctx.services.analysis.startAnalysis({
        userId: ctx.user.id,
        chatId: ctx.chat.id,
        inputType: "username",
        username: state.payload.username,
        mode: state.payload.mode,
        language: ctx.user.language === "en" ? "en" : "ru",
        targetPosition: state.payload.targetPosition,
        idempotencyKey: `analysis:${ctx.user.id}:${state.payload.username}:${state.payload.mode}:${randomUUID()}`
      });
      await ctx.services.wizard.clear(ctx.user.id);
      await ctx.answerCallbackQuery();
      await sendHtml(ctx, messages.jobQueued(state.payload.username));
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        await ctx.answerCallbackQuery();
        await sendHtml(ctx, messages.insufficientCredits(error), paymentMethodsKeyboard(messages));
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
        await sendHtml(ctx, messages.chooseMode(username), modeKeyboard(messages, ctx.services.users.isCompliance(ctx.user)));
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
    if (!state && ctx.user.consentAcceptedAt) {
      try {
        const username = normalizeInstagramUsername(ctx.message.text);
        await ctx.services.wizard.set(ctx.user.id, "selecting_mode", { username });
        await sendHtml(ctx, messages.chooseMode(username), modeKeyboard(messages, ctx.services.users.isCompliance(ctx.user)));
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
    await sendHtml(ctx, t(ctx.user.language).cancelled(), backMenuKeyboard(t(ctx.user.language)));
  });
}

async function showConfirm(ctx: MyContext, payload: AnalyzePayload) {
  if (!ctx.user || !payload.username || !payload.mode) return;
  const messages = t(ctx.user.language);
  await ctx.services.wizard.set(ctx.user.id, "confirming_analysis", payload);
  await sendHtml(
    ctx,
    messages.confirmAnalysis({
      username: payload.username,
      mode: payload.mode,
      costUnits: MODE_COST_UNITS[payload.mode]
    }),
    confirmAnalysisKeyboard(messages, payload.mode)
  );
}

function cancelKeyboard(ctx: MyContext) {
  const messages = t(ctx.user?.language);
  return new InlineKeyboard().text(messages.buttons.cancel, CB.CANCEL).text(messages.buttons.menu, CB.BACK_MAIN);
}
