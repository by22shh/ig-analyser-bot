import { describe, expect, it } from "vitest";
import { ru } from "../../src/telegram/locales/ru.js";
import { mainMenuKeyboard } from "../../src/telegram/keyboards/main-menu.js";
import { paymentMethodsKeyboard, packageKeyboard } from "../../src/telegram/keyboards/payments.js";
import { reportActionsKeyboard } from "../../src/telegram/keyboards/reports.js";
import { publicPackages } from "../../src/modules/billing/packages.js";

describe("message snapshots", () => {
  it("renders start payload", () => {
    expect(
      ru.welcome({
        totalUnits: 300,
        purchasedUnits: 300,
        grantedUnits: 0,
        language: "ru"
      })
    ).toMatchSnapshot();
    expect(mainMenuKeyboard(ru, true).inline_keyboard).toMatchSnapshot();
  });

  it("renders profile", () => {
    expect(
      ru.profile({
        name: "Nikita",
        telegramId: 123,
        language: "ru",
        totalUnits: 100,
        purchasedUnits: 0,
        grantedUnits: 100,
        completedReports: 2,
        activeJobs: 1,
        retentionDays: 30
      })
    ).toMatchSnapshot();
  });

  it("renders paywall and insufficient credits", () => {
    expect(ru.paywallIntro(true)).toMatchSnapshot();
    expect(paymentMethodsKeyboard(ru).inline_keyboard).toMatchSnapshot();
    expect(
      packageKeyboard(ru, "telegram_stars", publicPackages("telegram_stars")).inline_keyboard
    ).toMatchSnapshot();
    expect(ru.insufficientCredits({ costUnits: 200, availableUnits: 50 })).toMatchSnapshot();
  });

  it("renders report actions", () => {
    expect(reportActionsKeyboard(ru, "report-id").inline_keyboard).toMatchSnapshot();
  });
});
