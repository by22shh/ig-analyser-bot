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
    const missing = validateRequiredSections("influencer", [
      { title: "Brand safety", content: "", sources: [] }
    ]);
    expect(missing).toContain("Audience quality");
  });

  it("accepts English aliases for required standard sections", () => {
    const sections = [
      "Main themes and priorities",
      "Recurring visual and textual patterns",
      "Behavior and engagement",
      "Audience and comments",
      "Communication style",
      "Profession and status",
      "Difference from typical accounts",
      "Absences as a signal",
      "Potential value of contact",
      "Triggers and hooks",
      "Communication recommendations",
      "Ready phrases for starting a dialogue",
      "Non-obvious observations",
      "Overall profile value assessment",
      "Behavioral signals",
      "Mistakes, blind spots, barriers",
      "Brand-like image"
    ].map((title) => ({ title, content: "", sources: [] }));

    expect(validateRequiredSections("standard", sections)).toEqual([]);
  });
});
