import { describe, expect, it } from "vitest";
import { reportStandardPrompt } from "../../src/prompts/report.standard.v1.js";

describe("standard report prompt", () => {
  it("ships v7 with a style exemplar for practical sections", () => {
    expect(reportStandardPrompt.key).toBe("report.standard.v7");
    expect(reportStandardPrompt.system).toContain("STYLE EXAMPLE");
    expect(reportStandardPrompt.system).toContain("do not copy its facts");
  });

  it("keeps the exemplar clearly fictional and language-neutral", () => {
    expect(reportStandardPrompt.system).toContain("fictional profile");
    expect(reportStandardPrompt.system).toContain("requested language");
  });
});
