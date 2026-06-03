import { CB } from "../constants.js";
import type { MyContext } from "../context.js";
import { reportChatKeyboard } from "../keyboards/reports.js";
import { t, type LocaleMessages } from "../locales/index.js";
import { sendHtml } from "./helpers.js";

export function registerChatHandlers(bot: import("grammy").Bot<MyContext>) {
  bot.callbackQuery(new RegExp(`^${CB.REPORT_CHAT}:([0-9a-f-]+)$`), async (ctx) => {
    if (!ctx.user || !ctx.match?.[1]) return;
    const messages = t(ctx.user.language);
    await ctx.services.wizard.set(ctx.user.id, "report_chat", { reportId: ctx.match[1] });
    await ctx.answerCallbackQuery();
    await sendHtml(ctx, messages.chatIntro(), reportChatKeyboard(messages, ctx.match[1]));
  });

  bot.callbackQuery(new RegExp(`^${CB.CHAT_QUICK}:([0-9a-f-]+):([a-z_]+)$`), async (ctx) => {
    if (!ctx.user || !ctx.match?.[1] || !ctx.match?.[2]) return;
    const messages = t(ctx.user.language);
    await ctx.answerCallbackQuery();
    await ask(ctx, ctx.match[1], quickQuestion(messages, ctx.match[2]));
  });

  bot.on("message:text", async (ctx, next) => {
    if (!ctx.user || !ctx.message?.text || ctx.message.text.startsWith("/")) {
      await next();
      return;
    }
    const state = await ctx.services.wizard.get<{ reportId?: string }>(ctx.user.id);
    if (state?.state !== "report_chat" || !state.payload.reportId) {
      await next();
      return;
    }
    await ask(ctx, state.payload.reportId, ctx.message.text);
  });
}

function quickQuestion(messages: LocaleMessages, key: string): string {
  const questions: Record<string, string> = {
    intro: messages.chatQuick.introQuestion,
    sincerity: messages.chatQuick.sincerityQuestion,
    portrait: messages.chatQuick.portraitQuestion
  };
  return questions[key] ?? messages.chatQuick.fallbackQuestion;
}

async function ask(ctx: MyContext, reportId: string, question: string) {
  if (!ctx.user) return;
  await ctx.replyWithChatAction("typing");
  const answer = await ctx.services.chat.ask({
    userId: ctx.user.id,
    reportId,
    question,
    language: ctx.user.language === "en" ? "en" : "ru"
  });
  await sendHtml(ctx, answer.text, reportChatKeyboard(t(ctx.user.language), reportId));
}
