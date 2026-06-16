import { describe, expect, it } from "vitest";
import { buildReportChatContext } from "../../src/modules/chat/context.js";

describe("buildReportChatContext", () => {
  it("keeps structured summary, evidence, metrics and section sources for chat", () => {
    const context = JSON.parse(
      buildReportChatContext({
        id: "r1",
        mode: "standard",
        language: "ru",
        rawText: "raw",
        summary: {
          bullets: ["Main finding"],
          warnings: [],
          quality: { score: 92, findings: [] },
          evidence: {
            selectedPostIds: ["p1"],
            evidenceMap: [{ id: "post:p1", label: "Selected evidence post" }]
          }
        },
        metrics: { analyzedPosts: 3, engagementRate: 5.5 },
        sourceMap: [{ postId: "p1", url: "https://www.instagram.com/p/p1/" }],
        sections: [
          {
            position: 1,
            title: "Основные темы и приоритеты",
            content: "Confidence: medium. Public evidence from selected posts.",
            sources: [{ postId: "p1", url: "https://www.instagram.com/p/p1/" }]
          }
        ]
      })
    ) as {
      summary: { quality: { score: number }; evidence: { selectedPostIds: string[] } };
      metrics: { analyzedPosts: number };
      sections: Array<{ sources: unknown[] }>;
    };

    expect(context.summary.quality.score).toBe(92);
    expect(context.summary.evidence.selectedPostIds).toEqual(["p1"]);
    expect(context.metrics.analyzedPosts).toBe(3);
    expect(context.sections[0]?.sources).toHaveLength(1);
  });

  it("strips raw section markers from legacy report text before chat use", () => {
    const context = JSON.parse(
      buildReportChatContext({
        id: "r1",
        mode: "standard",
        language: "ru",
        rawText: "[[SECTION]]\nОсновные темы\nConfidence: medium.",
        summary: {
          executiveSummary: "[[SECTION]] Executive",
          bullets: ["[[SECTION]] Bullet"],
          warnings: ["[[SECTION]] Warning"]
        },
        sections: []
      })
    ) as {
      summary: { executiveSummary: string; bullets: string[]; warnings: string[] };
      rawTextExcerpt: string;
    };

    expect(JSON.stringify(context)).not.toContain("[[SECTION]]");
    expect(context.rawTextExcerpt).toContain("Основные темы");
    expect(context.summary.executiveSummary).toBe("Executive");
    expect(context.summary.bullets).toEqual(["Bullet"]);
    expect(context.summary.warnings).toEqual(["Warning"]);
  });
});
