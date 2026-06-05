import { describe, expect, it } from "vitest";
import { REQUIRED_SECTIONS } from "../../src/modules/reports/parser.js";
import { sectionGuidesForMode } from "../../src/prompts/section-guides.js";

describe("section guides", () => {
  it("has a non-empty guide for every standard required section", () => {
    const guides = sectionGuidesForMode("standard");
    for (const title of REQUIRED_SECTIONS.standard) {
      expect(guides[title], `missing guide for: ${title}`).toBeTruthy();
    }
  });

  it("returns an empty object for modes without curated guides", () => {
    expect(sectionGuidesForMode("influencer")).toEqual({});
  });
});
