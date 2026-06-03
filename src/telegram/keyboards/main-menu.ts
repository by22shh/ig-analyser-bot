import { InlineKeyboard } from "grammy";
import { env } from "../../config/env.js";
import { CB } from "../constants.js";
import type { LocaleMessages } from "../locales/index.js";

export function mainMenuKeyboard(messages: LocaleMessages, isAdmin = false): InlineKeyboard {
  const kb = new InlineKeyboard().text(messages.buttons.analyze, CB.ANALYZE);
  if (env.FEATURE_PHOTO_SEARCH) kb.text(messages.buttons.photo, CB.PHOTO);
  kb.row()
    .text(messages.buttons.history, CB.HISTORY)
    .text(messages.buttons.profile, CB.PROFILE)
    .row()
    .text(messages.buttons.credits, CB.PAYWALL)
    .text(messages.buttons.settings, CB.SETTINGS)
    .row()
    .text(messages.buttons.capabilities, "cap");

  if (env.CHANNEL_URL) kb.url(messages.buttons.channel, env.CHANNEL_URL);
  if (env.SUPPORT_URL) kb.text(messages.buttons.support, "help");
  if (isAdmin) {
    if (env.CHANNEL_URL || env.SUPPORT_URL) kb.row();
    kb.text(messages.buttons.admin, CB.ADMIN);
  }
  return kb;
}

export function backMenuKeyboard(messages: LocaleMessages): InlineKeyboard {
  return new InlineKeyboard().text(messages.buttons.menu, CB.BACK_MAIN);
}

export function consentKeyboard(messages: LocaleMessages): InlineKeyboard {
  return new InlineKeyboard()
    .text("Русский", `${CB.LANG}:ru`)
    .text("English", `${CB.LANG}:en`)
    .row()
    .text(messages.buttons.accept, CB.ACCEPT_RULES);
}

export function helpKeyboard(messages: LocaleMessages): InlineKeyboard {
  const kb = new InlineKeyboard().text(messages.buttons.capabilities, "cap").row();
  kb.url(messages.buttons.terms, env.TOS_URL);
  if (env.CHANNEL_URL) kb.row().url(messages.buttons.channel, env.CHANNEL_URL);
  return kb.row().text(messages.buttons.menu, CB.BACK_MAIN);
}

export function settingsKeyboard(messages: LocaleMessages): InlineKeyboard {
  return new InlineKeyboard()
    .text("Русский", `${CB.SET_LANGUAGE}:ru`)
    .text("English", `${CB.SET_LANGUAGE}:en`)
    .row()
    .text(messages.exportFormatTitle("pdf"), `${CB.SET_EXPORT}:pdf`)
    .text(messages.exportFormatTitle("markdown"), `${CB.SET_EXPORT}:markdown`)
    .text(messages.exportFormatTitle("html"), `${CB.SET_EXPORT}:html`)
    .row()
    .text(messages.retentionTitle(7), `${CB.SET_RETENTION}:7`)
    .text(messages.retentionTitle(30), `${CB.SET_RETENTION}:30`)
    .text(messages.retentionTitle(90), `${CB.SET_RETENTION}:90`)
    .row()
    .text(messages.buttons.menu, CB.BACK_MAIN);
}
