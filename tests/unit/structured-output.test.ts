import { describe, expect, it } from "vitest";
import {
  parseStructuredReport,
  reportResponseFormat,
  renderStructuredReport
} from "../../src/modules/llm/structured-output.js";
import { parseReportSections } from "../../src/modules/reports/parser.js";

describe("structured report output", () => {
  it("renders structured evidence into marker sections with parseable sources", () => {
    const structured = parseStructuredReport(
      JSON.stringify({
        summaryBullets: ["Pattern with source"],
        sections: [
          {
            title: "Основные темы и приоритеты",
            content: "Профиль часто показывает рабочий запуск как публичную тему.",
            evidence: [
              {
                postId: "p1",
                url: "https://www.instagram.com/p/p1/",
                label: "launch post",
                fact: "caption mentions launch",
                confidence: "high"
              }
            ],
            confidence: "high",
            caveats: ["Проверено только по публичным постам."]
          }
        ]
      })
    );

    const raw = renderStructuredReport(structured);
    const sections = parseReportSections(raw, "standard");

    expect(raw).toContain("[[SECTION]]");
    expect(sections[0]?.sources[0]).toMatchObject({
      postId: "p1",
      url: "https://www.instagram.com/p/p1/"
    });
  });

  it("can constrain structured report sections by mode", () => {
    const format = reportResponseFormat([
      "Основные темы и приоритеты",
      "Повторяющиеся визуальные и текстовые паттерны"
    ]);
    const sections = (
      format.json_schema.schema.properties as {
        sections: { minItems: number; maxItems?: number; description: string };
      }
    ).sections;

    expect(sections.minItems).toBe(2);
    expect(sections.maxItems).toBe(2);
    expect(sections.description).toContain("Основные темы и приоритеты");
  });
});
