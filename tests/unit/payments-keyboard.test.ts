import { describe, expect, it } from "vitest";
import { CB } from "../../src/telegram/constants.js";
import { packageBackTarget, packageKeyboard } from "../../src/telegram/keyboards/payments.js";
import { ru } from "../../src/telegram/locales/ru.js";
import { publicPackages } from "../../src/modules/billing/packages.js";

function callbackData(button: unknown): string | undefined {
  return (button as { callback_data?: string }).callback_data;
}

describe("packageBackTarget", () => {
  it("returns to the method chooser when several methods are enabled", () => {
    expect(packageBackTarget(2)).toBe(CB.PAYWALL);
  });

  it("returns to the main menu when one or zero methods are enabled", () => {
    expect(packageBackTarget(1)).toBe(CB.BACK_MAIN);
    expect(packageBackTarget(0)).toBe(CB.BACK_MAIN);
  });
});

describe("packageKeyboard back row", () => {
  const packages = publicPackages("telegram_stars");

  it("offers Back→chooser and Menu→main when multiple methods exist", () => {
    const rows = packageKeyboard(ru, "telegram_stars", packages, 2).inline_keyboard;
    const lastRow = rows.at(-1) ?? [];
    expect(lastRow.map(callbackData)).toEqual([CB.PAYWALL, CB.BACK_MAIN]);
  });

  it("collapses to a single Back→main button with one method (fixes the Stars back-loop)", () => {
    const rows = packageKeyboard(ru, "telegram_stars", packages, 1).inline_keyboard;
    const lastRow = rows.at(-1) ?? [];
    expect(lastRow).toHaveLength(1);
    expect(callbackData(lastRow[0])).toBe(CB.BACK_MAIN);
  });
});
