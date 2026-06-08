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
});
