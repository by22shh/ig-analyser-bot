import { afterEach, describe, expect, it, vi } from "vitest";

describe("economics", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("computes Stars and YooKassa revenue floors", async () => {
    vi.stubEnv("ECON_STANDARD_REPORT_COST_P75_RUB", "50");
    vi.stubEnv("ECON_SUPPORT_RESERVE_RUB", "5");
    vi.stubEnv("ECON_CHAT_MESSAGE_COST_P75_RUB", "2");
    const model = await import("../../src/modules/economics/model.js");
    const settings = model.economicsSettingsFromEnv();
    expect(model.minCardNetRubPerCredit(settings)).toBeCloseTo(184);
    expect(model.minStarsNetRubPerCredit(settings)).toBeCloseTo(165.6);
    expect(settings.providerCosts.standard).toBeCloseTo(55);
    expect(
      model.revenueMultiple(100, settings.providerCosts.standard ?? 0, settings)
    ).toBeGreaterThanOrEqual(3);
  });

  it("adds support reserve to the standard report economics cost", async () => {
    vi.stubEnv("ECON_STANDARD_REPORT_COST_P75_RUB", "55");
    vi.stubEnv("ECON_SUPPORT_RESERVE_RUB", "5");
    vi.stubEnv("ECON_CHAT_MESSAGE_COST_P75_RUB", "2");
    const model = await import("../../src/modules/economics/model.js");
    const settings = model.economicsSettingsFromEnv();

    expect(settings.supportReserveRub).toBe(5);
    expect(settings.providerCosts.standard).toBeCloseTo(60);
    expect(model.requiredUnitsForCost(settings.providerCosts.standard ?? 0, settings)).toBe(109);
    expect(model.revenueMultiple(100, settings.providerCosts.standard ?? 0, settings)).toBeLessThan(
      3
    );
  });

  it("adds support reserve to photo search when the feature is modeled", async () => {
    vi.stubEnv("ECON_STANDARD_REPORT_COST_P75_RUB", "50");
    vi.stubEnv("ECON_PHOTO_SEARCH_COST_P75_RUB", "20");
    vi.stubEnv("ECON_SUPPORT_RESERVE_RUB", "5");
    vi.stubEnv("ECON_CHAT_MESSAGE_COST_P75_RUB", "2");
    const model = await import("../../src/modules/economics/model.js");
    const settings = model.economicsSettingsFromEnv();

    expect(settings.providerCosts.photo_search).toBeCloseTo(25);
    expect(model.requiredUnitsForCost(settings.providerCosts.photo_search ?? 0, settings)).toBe(46);
  });
});
