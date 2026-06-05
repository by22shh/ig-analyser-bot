import { InlineKeyboard } from "grammy";
import { env } from "../../config/env.js";
import type { PackageView } from "../../modules/billing/packages.js";
import { CB } from "../constants.js";
import type { LocaleMessages } from "../locales/index.js";

export function paymentMethodsKeyboard(messages: LocaleMessages): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (env.FEATURE_TELEGRAM_STARS) kb.text(messages.buttons.stars, CB.PAY_METHOD_STARS).row();
  if (env.FEATURE_YOOKASSA_PAYMENTS)
    kb.text(messages.buttons.yookassa, CB.PAY_METHOD_YOOKASSA).row();
  return kb.text(messages.buttons.menu, CB.BACK_MAIN);
}

export function enabledPaymentMethodCount(): number {
  return [env.FEATURE_TELEGRAM_STARS, env.FEATURE_YOOKASSA_PAYMENTS].filter(Boolean).length;
}

/**
 * Back target for the package screen. With a single enabled payment method the
 * paywall renders packages directly (no method chooser), so "Back" must return
 * to the main menu — pointing it at CB.PAYWALL would re-render the same package
 * screen and trap the user (the reported Stars back-loop).
 */
export function packageBackTarget(enabledMethodCount: number): string {
  return enabledMethodCount > 1 ? CB.PAYWALL : CB.BACK_MAIN;
}

export function packageKeyboard(
  messages: LocaleMessages,
  provider: "telegram_stars" | "yookassa",
  packages: PackageView[],
  enabledMethodCount: number = enabledPaymentMethodCount()
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const pkg of packages) {
    const amount = provider === "telegram_stars" ? pkg.starsAmount : pkg.rubAmount;
    if (amount == null) continue;
    kb.text(
      messages.packageButton(pkg, provider),
      `${provider === "telegram_stars" ? CB.BUY_STARS : CB.BUY_YOOKASSA}:${pkg.code}`
    ).row();
  }
  if (packageBackTarget(enabledMethodCount) === CB.PAYWALL) {
    return kb.text(messages.buttons.back, CB.PAYWALL).text(messages.buttons.menu, CB.BACK_MAIN);
  }
  return kb.text(messages.buttons.back, CB.BACK_MAIN);
}
