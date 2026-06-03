import { InlineKeyboard } from "grammy";
import { CB } from "../constants.js";
import type { LocaleMessages } from "../locales/index.js";

export function reportActionsKeyboard(messages: LocaleMessages, reportId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(messages.buttons.sections, `${CB.REPORT_SECTIONS}:${reportId}`)
    .text(messages.buttons.pdf, `${CB.REPORT_PDF}:${reportId}`)
    .row()
    .text(messages.buttons.markdown, `${CB.REPORT_MARKDOWN}:${reportId}`)
    .text(messages.buttons.chat, `${CB.REPORT_CHAT}:${reportId}`)
    .row()
    .text(messages.buttons.sources, `${CB.REPORT_SOURCES}:${reportId}`)
    .row()
    .text(messages.buttons.repeat, `${CB.REPORT_OPEN}:${reportId}:repeat`)
    .text(messages.buttons.menu, CB.BACK_MAIN);
}

export function sectionListKeyboard(
  messages: LocaleMessages,
  reportId: string,
  sections: Array<{ id: string; position: number; title: string }>
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const section of sections) {
    kb.text(`${section.position}. ${section.title.slice(0, 28)}`, `${CB.REPORT_SECTION}:${section.id}`).row();
  }
  return kb.text(messages.buttons.pdf, `${CB.REPORT_PDF}:${reportId}`).text(messages.buttons.menu, CB.BACK_MAIN);
}

export function reportChatKeyboard(messages: LocaleMessages, reportId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(messages.chatQuick.introLabel, `${CB.CHAT_QUICK}:${reportId}:intro`)
    .row()
    .text(messages.chatQuick.sincerityLabel, `${CB.CHAT_QUICK}:${reportId}:sincerity`)
    .row()
    .text(messages.chatQuick.portraitLabel, `${CB.CHAT_QUICK}:${reportId}:portrait`)
    .row()
    .text(messages.buttons.pdf, `${CB.REPORT_PDF}:${reportId}`)
    .text(messages.buttons.menu, CB.BACK_MAIN);
}
