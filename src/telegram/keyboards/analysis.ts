import { InlineKeyboard } from "grammy";
import { env } from "../../config/env.js";
import { AnalysisMode, CB } from "../constants.js";
import type { LocaleMessages } from "../locales/index.js";

export function modeKeyboard(messages: LocaleMessages, isCompliance: boolean): InlineKeyboard {
  const kb = new InlineKeyboard().text(messages.modeTitle("standard"), `${CB.MODE}:standard`);
  if (env.FEATURE_INFLUENCER_MODE)
    kb.text(messages.modeTitle("influencer"), `${CB.MODE}:influencer`);
  kb.row();
  if (env.FEATURE_HR_MODE) kb.text(messages.modeTitle("hr"), `${CB.MODE}:hr`);
  if (env.FEATURE_OSINT_COMPLIANCE_MODE && isCompliance) {
    kb.text(messages.modeTitle("osint_compliance"), `${CB.MODE}:osint_compliance`);
  }
  return kb
    .row()
    .text(messages.buttons.cancel, CB.CANCEL)
    .text(messages.buttons.menu, CB.BACK_MAIN);
}

export function confirmAnalysisKeyboard(
  messages: LocaleMessages,
  mode: AnalysisMode,
  requestId: string
): InlineKeyboard {
  return new InlineKeyboard()
    .text(messages.buttons.run, `${CB.RUN}:${requestId}`)
    .row()
    .text(messages.buttons.back, CB.ANALYZE)
    .text(messages.buttons.cancel, CB.CANCEL);
}

export function osintLawfulBasisKeyboard(messages: LocaleMessages): InlineKeyboard {
  return new InlineKeyboard()
    .text(messages.buttons.confirmLawfulBasis, CB.OSINT_LAWFUL_BASIS)
    .row()
    .text(messages.buttons.back, CB.ANALYZE)
    .text(messages.buttons.cancel, CB.CANCEL);
}

export function goalKeyboard(messages: LocaleMessages): InlineKeyboard {
  return new InlineKeyboard()
    .text(messages.buttons.skip, CB.SKIP_GOAL)
    .row()
    .text(messages.buttons.cancel, CB.CANCEL)
    .text(messages.buttons.menu, CB.BACK_MAIN);
}
