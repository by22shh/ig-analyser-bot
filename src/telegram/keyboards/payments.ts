import { InlineKeyboard } from "grammy";
import { env } from "../../config/env.js";
import type { PackageView } from "../../modules/billing/packages.js";
import { CB } from "../constants.js";
import type { LocaleMessages } from "../locales/index.js";

export function paymentMethodsKeyboard(messages: LocaleMessages): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (env.FEATURE_TELEGRAM_STARS) kb.text(messages.buttons.stars, CB.PAY_METHOD_STARS).row();
  if (env.FEATURE_YOOKASSA_PAYMENTS) kb.text(messages.buttons.yookassa, CB.PAY_METHOD_YOOKASSA).row();
  return kb.text(messages.buttons.menu, CB.BACK_MAIN);
}

export function packageKeyboard(
  messages: LocaleMessages,
  provider: "telegram_stars" | "yookassa",
  packages: PackageView[]
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const pkg of packages) {
    const amount = provider === "telegram_stars" ? pkg.starsAmount : pkg.rubAmount;
    if (amount == null) continue;
    kb.text(messages.packageButton(pkg, provider), `${provider === "telegram_stars" ? CB.BUY_STARS : CB.BUY_YOOKASSA}:${pkg.code}`).row();
  }
  return kb.text(messages.buttons.back, CB.PAYWALL).text(messages.buttons.menu, CB.BACK_MAIN);
}
