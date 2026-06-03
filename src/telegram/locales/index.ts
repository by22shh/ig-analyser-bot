import type { Locale } from "../constants.js";
import { en } from "./en.js";
import { ru } from "./ru.js";

export const locales = { ru, en };

export type LocaleMessages = typeof ru;

export function t(locale: string | null | undefined): LocaleMessages {
  return locales[(locale === "en" ? "en" : "ru") satisfies Locale];
}
