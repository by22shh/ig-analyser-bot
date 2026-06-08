import { describe, expect, it } from "vitest";
import { REQUIRED_SECTIONS } from "../../src/modules/reports/parser.js";
import { sectionGuidesForMode } from "../../src/prompts/section-guides.js";

describe("section guides", () => {
  it("has a non-empty guide for every required section in every mode", () => {
    for (const mode of ["standard", "influencer", "hr", "osint_compliance"] as const) {
      const guides = sectionGuidesForMode(mode);
      for (const title of REQUIRED_SECTIONS[mode]) {
        expect(guides[title], `missing guide for ${mode}: ${title}`).toBeTruthy();
      }
    }
  });
});
