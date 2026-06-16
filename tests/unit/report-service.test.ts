import { describe, expect, it, vi } from "vitest";

import { renderReportHtml, renderReportMarkdown } from "../../src/modules/reports/export.js";
import { ReportService } from "../../src/modules/reports/report.service.js";
import type { StrategicReportView } from "../../src/modules/reports/types.js";

describe("ReportService", () => {
  it("only returns completed reports with their sections", async () => {
    const findFirst = vi.fn();
    const service = new ReportService({ report: { findFirst } } as never, {} as never, {} as never);

    await service.getReportWithSections("report-1", "user-1");

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "report-1", userId: "user-1", analysisJob: { status: "completed" } },
      include: {
        sections: { orderBy: { position: "asc" } },
        artifacts: true,
        analysisJob: true
      }
    });
  });

  it("excludes reports for active or failed analysis jobs from history", async () => {
    const findMany = vi.fn();
    const service = new ReportService({ report: { findMany } } as never, {} as never, {} as never);

    await service.latestReports("user-1", 12);

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", analysisJob: { status: "completed" } },
      include: { analysisJob: true, artifacts: true },
      orderBy: { createdAt: "desc" },
      take: 12
    });
  });

  it("fails artifact creation before storing anything when PDF rendering fails", async () => {
    const transaction = vi.fn();
    const storage = {
      putObject: vi.fn(),
      signedUrl: vi.fn(),
      deleteObjects: vi.fn()
    };
    const pdf = {
      renderPdf: vi.fn().mockRejectedValue(new Error("browser crashed"))
    };
    const service = new ReportService(
      { $transaction: transaction } as never,
      storage as never,
      pdf as never
    );

    await expect(
      service.createArtifacts("report-1", minimalReport(), new Date("2026-01-01T00:00:00.000Z"))
    ).rejects.toThrow("PDF_RENDER_FAILED");

    expect(storage.putObject).not.toHaveBeenCalled();
    expect(storage.deleteObjects).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("renders report warnings and post-ID-only sources into downloadable artifacts", () => {
    const report = minimalReport();
    report.summary.executiveSummary = "[[SECTION]] Executive Summary";
    report.summary.bullets = ["[[SECTION]] Summary"];
    report.summary.warnings = ["[[SECTION]] Quality flags: score 72/100, 4 medium/high findings"];
    report.sections[0]!.title = "[[SECTION]] Section";
    report.sections[0]!.content = "[[SECTION]] Content";
    report.sections[0]!.sources = [{ postId: "p1", label: "post-only evidence" }];

    const markdown = renderReportMarkdown(report);
    const html = renderReportHtml(report);

    expect(markdown).not.toContain("[[SECTION]]");
    expect(html).not.toContain("[[SECTION]]");
    expect(markdown).toContain("## Quality Warnings");
    expect(markdown).toContain("## Analysis Health");
    expect(markdown).toContain("Comment coverage: 1/1 posts (100%)");
    expect(markdown).toContain("Quality flags");
    expect(html).toContain("Executive Summary");
    expect(html).toContain("Analysis Health");
    expect(html).toContain("Quality Warnings");
    expect(html).toContain("Comment coverage");
    expect(html).toContain("post-only evidence");
    expect(html).toContain("p1");
  });
});

function minimalReport(): StrategicReportView {
  return {
    mode: "standard",
    username: "example",
    language: "ru",
    rawText: "raw",
    sections: [{ title: "Section", content: "Content", sources: [] }],
    summary: {
      executiveSummary: "Что это значит: проверочная выжимка.",
      bullets: ["Summary"],
      warnings: [],
      analysisHealth: {
        formatLabel: "near-full public-post read",
        analyzedPosts: 1,
        metadataPosts: 1,
        visualPosts: 1,
        postsCount: 1,
        sampleCoveragePercent: 100,
        metadataCoveragePercent: 100,
        visualCoveragePercent: 100,
        sampleCoverageLevel: "near_full",
        visionCompleted: 1,
        visionTotal: 1,
        visionCompletionPercent: 100,
        postsWithCommentText: 1,
        commentCoveragePercent: 100,
        commentTextCount: 1,
        postsWithAuthorReplies: 0,
        authorReplyCount: 0
      }
    },
    metrics: {
      followersCount: 10,
      followsCount: 5,
      postsCount: 1,
      analyzedPosts: 1,
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
    },
    sourceMap: [],
    model: "model",
    promptVersion: "prompt",
    profile: {
      username: "example",
      followersCount: 10,
      followsCount: 5,
      postsCount: 1,
      isVerified: false,
      relatedProfiles: [],
      posts: []
    },
    posts: [],
    vision: []
  };
}
