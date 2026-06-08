import { describe, expect, it } from "vitest";
import {
  evaluateReportQuality,
  qualityFindingsNeedRepair,
  renderQualityFindings
} from "../../src/modules/analysis/report-quality.js";
import type { ReportSectionView } from "../../src/modules/reports/types.js";

describe("report quality validation", () => {
  it("flags unsupported generic sections for repair", () => {
    const quality = evaluateReportQuality({
      mode: "standard",
      sections: [
        {
          title: "Основные темы и приоритеты",
          content: "Публичный профиль показывает повторяющийся паттерн.",
          sources: []
        }
      ]
    });

    expect(quality.score).toBeLessThan(75);
    expect(quality.findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining([
        "section:Основные темы и приоритеты:missing_source",
        "section:Основные темы и приоритеты:thin_unsupported",
        "section:Основные темы и приоритеты:generic_language",
        "report:low_evidence_coverage"
      ])
    );
    expect(qualityFindingsNeedRepair(quality.findings)).toBe(true);
    expect(renderQualityFindings(quality.findings).join("\n")).toContain("HIGH");
  });

  it("passes source-backed, confidence-calibrated sections", () => {
    const sections: ReportSectionView[] = [
      {
        title: "Brand safety",
        content:
          "Confidence: medium. The section cites a public post and states a caveat about limited public evidence, while avoiding unsupported private-life claims.",
        sources: [
          {
            postId: "p1",
            url: "https://www.instagram.com/p/p1/",
            label: "Public post"
          }
        ]
      }
    ];

    const quality = evaluateReportQuality({ mode: "standard", sections });

    expect(quality.score).toBe(100);
    expect(quality.findings).toEqual([]);
    expect(qualityFindingsNeedRepair(quality.findings)).toBe(false);
  });

  it("flags standard reports built from a small analyzed sample", () => {
    const sections: ReportSectionView[] = [
      {
        title: "Основные темы и приоритеты",
        content: "Confidence: medium. Наблюдение ограничено публичной выборкой и требует проверки.",
        sources: [{ postId: "p1", label: "Public post" }]
      }
    ];

    const quality = evaluateReportQuality({
      mode: "standard",
      sections,
      metrics: {
        followersCount: 10,
        followsCount: 5,
        postsCount: 3,
        analyzedPosts: 3,
        avgLikes: 2,
        avgComments: 1,
        medianLikes: 2,
        medianComments: 1,
        engagementRate: 3,
        frequencyDays: 7,
        pinnedPostsCount: 0,
        uniqueLocations: [],
        uniqueMusic: [],
        relatedProfiles: [],
        topPostsByLikes: [],
        topPostsByComments: [],
        postTypeDistribution: {},
        hashtagFrequency: {},
        mentionFrequency: {},
        digitalCircle: []
      }
    });

    expect(quality.findings.map((finding) => finding.id)).toContain("mode:standard:thin_sample");
  });

  it("penalizes reports with missing vision and count-only comment evidence", () => {
    const sections: ReportSectionView[] = [
      {
        title: "Повторяющиеся визуальные и текстовые паттерны",
        content: "Confidence: medium. Наблюдение ограничено публичной выборкой и требует проверки.",
        sources: [{ postId: "p1", label: "Public post" }]
      }
    ];

    const quality = evaluateReportQuality({
      mode: "standard",
      sections,
      analysisContext: {
        riskSignals: [
          {
            id: "risk:vision_gaps",
            type: "risk",
            label: "Vision evidence gaps",
            detail: "1 selected visual item could not be analyzed.",
            confidence: "high"
          }
        ],
        audienceSignals: {
          frequentCommenters: [],
          repeatedCommentTerms: [],
          commentDensity: "medium",
          highCommentPostIds: ["p1"]
        }
      } as never
    });

    expect(quality.score).toBe(92);
    expect(quality.findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining(["report:vision_evidence_gap", "report:comments_count_only"])
    );
    expect(qualityFindingsNeedRepair(quality.findings)).toBe(false);
  });

  it("flags internal operational wording leaked into a report", () => {
    const quality = evaluateReportQuality({
      mode: "standard",
      sections: [
        {
          title: "Общая оценка ценности профиля",
          content:
            "Профиль полезен для production end-to-end evaluation after deploy и проверки pipeline.",
          sources: [{ postId: "p1", label: "Public post" }]
        }
      ]
    });

    expect(quality.findings.map((finding) => finding.id)).toContain(
      "report:internal_operational_goal_leak"
    );
    expect(quality.score).toBeLessThan(100);
    expect(qualityFindingsNeedRepair(quality.findings)).toBe(true);
  });

  it("flags internal schema terms leaked into a report", () => {
    const quality = evaluateReportQuality({
      mode: "standard",
      sections: [
        {
          title: "Основные темы и приоритеты",
          content: "contentClusters и audienceSignals показывают сильные postIds.",
          sources: [{ postId: "p1", label: "Public post" }]
        }
      ]
    });

    expect(quality.findings.map((finding) => finding.id)).toContain(
      "report:internal_schema_term_leak"
    );
    expect(qualityFindingsNeedRepair(quality.findings)).toBe(true);
  });
});
