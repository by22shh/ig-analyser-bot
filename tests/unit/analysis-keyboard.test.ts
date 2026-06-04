import { describe, expect, it } from "vitest";
import {
  confirmAnalysisKeyboard,
  osintLawfulBasisKeyboard
} from "../../src/telegram/keyboards/analysis.js";
import { CB } from "../../src/telegram/constants.js";
import { ru } from "../../src/telegram/locales/ru.js";

describe("analysis keyboards", () => {
  it("uses a request id in run callbacks so confirmations are single-use", () => {
    const keyboard = confirmAnalysisKeyboard(ru, "standard", "request-123").inline_keyboard;

    expect(callbackData(keyboard[0]?.[0])).toBe(`${CB.RUN}:request-123`);
  });

  it("requires explicit lawful-basis confirmation for OSINT mode", () => {
    const keyboard = osintLawfulBasisKeyboard(ru).inline_keyboard;

    expect(callbackData(keyboard[0]?.[0])).toBe(CB.OSINT_LAWFUL_BASIS);
  });
});

function callbackData(button: unknown): string | undefined {
  return button && typeof button === "object" && "callback_data" in button
    ? String(button.callback_data)
    : undefined;
}
