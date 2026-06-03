import { describe, expect, it } from "vitest";
import { parseReportSections, validateRequiredSections } from "../../src/modules/reports/parser.js";

describe("report parser", () => {
  it("parses marker sections and extracts links", () => {
    const sections = parseReportSections(
      "[[SECTION]]\nОсновные темы и приоритеты\nEvidence https://instagram.com/p/1/\n\n[[SECTION]]\nГотовые фразы для входа в диалог\nSay hello",
      "standard"
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]?.title).toBe("Основные темы и приоритеты");
    expect(sections[0]?.sources[0]?.url).toContain("instagram.com");
  });

  it("reports missing required sections", () => {
    const missing = validateRequiredSections("influencer", [{ title: "Brand safety", content: "", sources: [] }]);
    expect(missing).toContain("Audience quality");
  });
});
