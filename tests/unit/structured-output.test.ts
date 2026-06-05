import { describe, expect, it } from "vitest";
import {
  parseStructuredReport,
  parseStructuredVision,
  renderStructuredReport,
  renderVisionDescription,
  reportResponseFormat
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

  it("strips stray [[SECTION]] markers a model may embed in structured fields", () => {
    const structured = parseStructuredReport(
      JSON.stringify({
        summaryBullets: ["a", "b", "c"],
        sections: [
          {
            title: "[[SECTION]] Основные темы",
            content: "[[SECTION]]\nОсновные темы\nReal content A.",
            evidence: [],
            confidence: "low",
            caveats: []
          },
          {
            title: "Поведение",
            content: "[[SECTION]] inline marker leaked in\nReal content B.",
            evidence: [],
            confidence: "low",
            caveats: []
          }
        ]
      })
    );

    const raw = renderStructuredReport(structured);
    // Exactly one marker per section — no phantom doubling from leaked markers.
    expect(raw.match(/\[\[SECTION\]\]/g)?.length).toBe(2);

    const sections = parseReportSections(raw, "standard");
    expect(sections).toHaveLength(2);
    expect(sections[0]?.title).toBe("Основные темы");
    expect(sections[1]?.title).toBe("Поведение");
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

describe("structured vision output", () => {
  it("parses and renders verbatim text and the screenshot flag", () => {
    const parsed = parseStructuredVision(
      JSON.stringify({
        visibleFacts: ["two people on a seafront"],
        setting: "waterfront promenade",
        objects: ["sweatshirt", "smartphone"],
        textOverlays: ["AUTOMNE-H"],
        textVerbatim: ["AUTOMNE-H FALL/WINTER 24-25 COLLECTION"],
        visualStyle: ["daylight"],
        isLikelyScreenshot: true,
        uncertainty: ["exact location"]
      })
    );

    expect(parsed.textVerbatim).toContain("AUTOMNE-H FALL/WINTER 24-25 COLLECTION");
    expect(parsed.isLikelyScreenshot).toBe(true);

    const rendered = renderVisionDescription("p1", parsed);
    expect(rendered).toContain("AUTOMNE-H FALL/WINTER 24-25 COLLECTION");
    expect(rendered.toLowerCase()).toContain("screenshot");
  });

  it("defaults the screenshot flag to false and verbatim text to empty when absent", () => {
    const parsed = parseStructuredVision(
      JSON.stringify({
        visibleFacts: ["x"],
        setting: null,
        objects: [],
        textOverlays: [],
        visualStyle: [],
        uncertainty: []
      })
    );
    expect(parsed.isLikelyScreenshot).toBe(false);
    expect(parsed.textVerbatim).toEqual([]);
  });
});
