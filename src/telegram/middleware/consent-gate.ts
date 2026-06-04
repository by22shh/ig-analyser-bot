import type { NextFunction } from "grammy";
import { CB } from "../constants.js";
import type { MyContext } from "../context.js";
import { consentKeyboard } from "../keyboards/main-menu.js";
import { t } from "../locales/index.js";

const ALLOWED_COMMANDS = new Set(["/start", "/menu"]);

export async function consentGate(ctx: MyContext, next: NextFunction) {
  if (!ctx.user || ctx.user.consentAcceptedAt || isAllowedBeforeConsent(ctx)) {
    await next();
    return;
  }

  const messages = t(ctx.user.language);
  if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => undefined);
  await ctx.reply(messages.startNeedsConsent(), {
    parse_mode: "HTML",
    reply_markup: consentKeyboard(messages),
    link_preview_options: { is_disabled: true }
  });
}

function isAllowedBeforeConsent(ctx: MyContext): boolean {
  const text = ctx.message?.text?.trim();
  const command = text?.split(/\s+/, 1)[0];
  if (command && ALLOWED_COMMANDS.has(command)) return true;
  if (ctx.callbackQuery?.data === CB.ACCEPT_RULES) return true;
  if (ctx.callbackQuery?.data?.startsWith(`${CB.LANG}:`)) return true;
  if (ctx.preCheckoutQuery || ctx.message?.successful_payment) return true;
  return false;
}
