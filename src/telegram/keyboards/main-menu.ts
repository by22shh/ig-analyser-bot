import { InlineKeyboard } from "grammy";
import { env } from "../../config/env.js";
import { CB } from "../constants.js";
import type { LocaleMessages } from "../locales/index.js";

function mark(label: string, active: boolean): string {
  return active ? `${label} ✓` : label;
}

export function mainMenuKeyboard(messages: LocaleMessages, isAdmin = false): InlineKeyboard {
  // Primary action gets its own full-width row; everything else is grouped.
  const kb = new InlineKeyboard();
  if (env.FEATURE_MINI_APP) kb.webApp(messages.buttons.miniApp, env.MINI_APP_URL).row();
  kb.text(messages.buttons.analyze, CB.ANALYZE).row();
  if (env.FEATURE_PHOTO_SEARCH) kb.text(messages.buttons.photo, CB.PHOTO).row();
  kb.text(messages.buttons.history, CB.HISTORY)
    .text(messages.buttons.profile, CB.PROFILE)
    .row()
    .text(messages.buttons.credits, CB.PAYWALL)
    .text(messages.buttons.settings, CB.SETTINGS)
    .row()
    .text(messages.buttons.capabilities, CB.CAPABILITIES)
    .text(messages.buttons.help, CB.HELP);

  const hasLinks = Boolean(env.CHANNEL_URL || env.SUPPORT_URL);
  if (hasLinks) kb.row();
  if (env.CHANNEL_URL) kb.url(messages.buttons.channel, env.CHANNEL_URL);
  if (env.SUPPORT_URL) kb.url(messages.buttons.support, env.SUPPORT_URL);
  if (isAdmin) {
    kb.row();
    kb.text(messages.buttons.admin, CB.ADMIN);
  }
  return kb;
}

export function backMenuKeyboard(messages: LocaleMessages): InlineKeyboard {
  return new InlineKeyboard().text(messages.buttons.menu, CB.BACK_MAIN);
}

export function profileKeyboard(messages: LocaleMessages): InlineKeyboard {
  return new InlineKeyboard()
    .text(messages.buttons.credits, CB.PAYWALL)
    .text(messages.buttons.history, CB.HISTORY)
    .row()
    .text(messages.buttons.settings, CB.SETTINGS)
    .row()
    .text(messages.buttons.menu, CB.BACK_MAIN);
}

export function languageKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🇷🇺 Русский", `${CB.LANG}:ru`)
    .text("🇬🇧 English", `${CB.LANG}:en`);
}

export function consentKeyboard(messages: LocaleMessages): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text(messages.buttons.accept, CB.ACCEPT_RULES)
    .text(messages.buttons.decline, CB.DECLINE_RULES);
  if (env.TOS_URL) kb.row().url(messages.buttons.terms, env.TOS_URL);
  return kb;
}

export function declinedKeyboard(messages: LocaleMessages): InlineKeyboard {
  return new InlineKeyboard().text(messages.buttons.restart, CB.RESTART_ONBOARDING);
}

export function subscriptionGateKeyboard(messages: LocaleMessages): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (env.CHANNEL_URL) kb.url(messages.buttons.subscribe, env.CHANNEL_URL).row();
  return kb.text(messages.buttons.checkSubscription, CB.CHECK_SUB);
}

export function helpKeyboard(messages: LocaleMessages): InlineKeyboard {
  const kb = new InlineKeyboard().text(messages.buttons.capabilities, CB.CAPABILITIES);
  if (env.SUPPORT_URL) kb.row().url(messages.buttons.support, env.SUPPORT_URL);
  if (env.TOS_URL) kb.row().url(messages.buttons.terms, env.TOS_URL);
  if (env.CHANNEL_URL) kb.row().url(messages.buttons.channel, env.CHANNEL_URL);
  return kb.row().text(messages.buttons.menu, CB.BACK_MAIN);
}

export function settingsKeyboard(
  messages: LocaleMessages,
  current?: { language?: string; exportFormat?: string; retentionDays?: number }
): InlineKeyboard {
  const lang = current?.language;
  const fmt = current?.exportFormat;
  const days = current?.retentionDays;
  return new InlineKeyboard()
    .text(mark("Русский", lang === "ru"), `${CB.SET_LANGUAGE}:ru`)
    .text(mark("English", lang === "en"), `${CB.SET_LANGUAGE}:en`)
    .row()
    .text(mark(messages.exportFormatTitle("pdf"), fmt === "pdf"), `${CB.SET_EXPORT}:pdf`)
    .text(
      mark(messages.exportFormatTitle("markdown"), fmt === "markdown"),
      `${CB.SET_EXPORT}:markdown`
    )
    .text(mark(messages.exportFormatTitle("html"), fmt === "html"), `${CB.SET_EXPORT}:html`)
    .row()
    .text(mark(messages.retentionTitle(7), days === 7), `${CB.SET_RETENTION}:7`)
    .text(mark(messages.retentionTitle(30), days === 30), `${CB.SET_RETENTION}:30`)
    .text(mark(messages.retentionTitle(90), days === 90), `${CB.SET_RETENTION}:90`)
    .row()
    .text(messages.buttons.menu, CB.BACK_MAIN);
}
