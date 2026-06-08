import { describe, expect, it, vi } from "vitest";

import { ReportService } from "../../src/modules/reports/report.service.js";
import type { StrategicReportView } from "../../src/modules/reports/types.js";

describe("ReportService", () => {
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
});

function minimalReport(): StrategicReportView {
  return {
    mode: "standard",
    username: "example",
    language: "ru",
    rawText: "raw",
    sections: [{ title: "Section", content: "Content", sources: [] }],
    summary: { bullets: ["Summary"], warnings: [] },
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
