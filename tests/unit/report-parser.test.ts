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

  it("extracts evidence post IDs even when no URL is present", () => {
    const sections = parseReportSections(
      "[[SECTION]]\nОсновные темы и приоритеты\nEvidence:\n- [p42] public caption: launch mentioned (high) p42\nConfidence: medium",
      "standard"
    );

    expect(sections[0]?.sources).toEqual([expect.objectContaining({ postId: "p42" })]);
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

  it("accepts localized aliases for required non-standard sections", () => {
    const cases = [
      [
        "influencer",
        [
          "Безопасность бренда",
          "Качество аудитории",
          "Проверка подлинности",
          "Насыщенность рекламой",
          "Визуальное качество",
          "Скрытые инсайты",
          "Прогноз эффективности",
          "Вердикт маркетолога"
        ]
      ],
      [
        "hr",
        [
          "Культурное соответствие",
          "Red flags and risks",
          "Мягкие навыки",
          "Цифровая репутация",
          "Мотивация и энергия",
          "Неочевидные наблюдения",
          "Рекомендации для интервью",
          "Вердикт"
        ]
      ],
      [
        "osint_compliance",
        [
          "Публичные факты",
          "Сигналы активов и образа жизни",
          "Сигналы локаций",
          "Опубликованные контакты",
          "Проверки рисков и несостыковок",
          "Чеклист проверки",
          "Комплаенс заметки"
        ]
      ]
    ] as const;

    for (const [mode, titles] of cases) {
      const sections = titles.map((title) => ({ title, content: "", sources: [] }));
      expect(validateRequiredSections(mode, sections), mode).toEqual([]);
    }
  });
});
