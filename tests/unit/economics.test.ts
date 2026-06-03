import { describe, expect, it, vi } from "vitest";

describe("economics", () => {
  it("computes Stars and YooKassa revenue floors", async () => {
    vi.stubEnv("ECON_STANDARD_REPORT_COST_P75_RUB", "55");
    vi.stubEnv("ECON_CHAT_MESSAGE_COST_P75_RUB", "2");
    const model = await import("../../src/modules/economics/model.js");
    const settings = model.economicsSettingsFromEnv();
    expect(model.minCardNetRubPerCredit(settings)).toBeCloseTo(184);
    expect(model.minStarsNetRubPerCredit(settings)).toBeCloseTo(165.6);
    expect(model.revenueMultiple(100, 55, settings)).toBeGreaterThanOrEqual(3);
  });
});
