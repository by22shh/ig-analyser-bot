import { describe, expect, it, vi } from "vitest";
import { buildStrategicReport } from "../../src/modules/analysis/report-builder.js";
import type { InstagramPost, InstagramProfile } from "../../src/modules/instagram/types.js";
import type { LlmProvider } from "../../src/modules/llm/types.js";
import { REQUIRED_SECTIONS } from "../../src/modules/reports/parser.js";

describe("buildStrategicReport", () => {
  it("uses repair output when the first report is missing required sections", async () => {
    const post: InstagramPost = {
      id: "p1",
      type: "Image",
      caption: "public launch",
      hashtags: [],
      mentions: [],
      likesCount: 10,
      commentsCount: 1,
      latestComments: [],
      timestamp: "2026-06-01T00:00:00Z",
      url: "https://www.instagram.com/p/p1/",
      isPinned: false,
      childPosts: [],
      taggedUsers: []
    };
    const profile: InstagramProfile = {
      username: "alice",
      followersCount: 100,
      followsCount: 20,
      postsCount: 1,
      isVerified: false,
      relatedProfiles: [],
      posts: [post]
    };
    const repairedRaw = REQUIRED_SECTIONS.standard
      .map(
        (title, index) =>
          `[[SECTION]]\n${title}\nСекция ${index + 1} с проверяемым наблюдением.\nEvidence:\n- [p1] public post: факт https://www.instagram.com/p/p1/`
      )
      .join("\n\n");
    const llm: LlmProvider = {
      analyzeVision: vi.fn(async () => [
        {
          postId: "p1",
          status: "completed" as const,
          description: "[Image ID: p1] public image fact",
          model: "vision",
          promptVersion: "vision"
        }
      ]),
      generateReport: vi.fn(async () => ({
        rawText: "[[SECTION]]\nОсновные темы и приоритеты\nСлишком коротко.",
        model: "reasoning",
        promptVersion: "report"
      })),
      repairReport: vi.fn(async () => ({
        rawText: repairedRaw,
        model: "reasoning",
        promptVersion: "report.repair",
        summaryBullets: ["Резюме из structured output."]
      })),
      chat: vi.fn()
    };

    const report = await buildStrategicReport({
      mode: "standard",
      language: "ru",
      profile,
      llm
    });

    expect(llm.repairReport).toHaveBeenCalledWith(
      expect.objectContaining({
        missingSections: expect.arrayContaining(["Повторяющиеся визуальные и текстовые паттерны"]),
        metrics: expect.objectContaining({ analyzedPosts: 1 })
      })
    );
    expect(report.sections).toHaveLength(REQUIRED_SECTIONS.standard.length);
    expect(report.summary.bullets).toEqual(["Резюме из structured output."]);
    expect(report.summary.warnings).toEqual([]);
    expect(report.promptVersion).toBe("report.repair");
  });

  it("triggers repair on a forbidden inference even when all sections exist", async () => {
    const post: InstagramPost = {
      id: "p1",
      type: "Image",
      caption: "public walk",
      hashtags: [],
      mentions: [],
      likesCount: 10,
      commentsCount: 1,
      latestComments: [],
      timestamp: "2026-06-01T00:00:00Z",
      url: "https://www.instagram.com/p/p1/",
      isPinned: false,
      childPosts: [],
      taggedUsers: []
    };
    const profile: InstagramProfile = {
      username: "alice",
      followersCount: 100,
      followsCount: 20,
      postsCount: 1,
      isVerified: false,
      relatedProfiles: [],
      posts: [post]
    };
    const buildFull = (audience: string) =>
      REQUIRED_SECTIONS.standard
        .map((title) => {
          const content =
            title === "Аудитория и комментарии" ? audience : "Наблюдение по публичным данным.";
          return `[[SECTION]]\n${title}\n${content}\nEvidence:\n- [p1] факт https://www.instagram.com/p/p1/`;
        })
        .join("\n\n");
    const unsafeRaw = buildFull("Скорее всего, автор состоит в романтических отношениях.");
    const safeRaw = buildFull("Аудитория реагирует на локацию и стиль.");

    const llm: LlmProvider = {
      analyzeVision: vi.fn(async () => [
        {
          postId: "p1",
          status: "completed" as const,
          description: "[Image ID: p1] public fact",
          model: "vision",
          promptVersion: "vision"
        }
      ]),
      generateReport: vi.fn(async () => ({
        rawText: unsafeRaw,
        model: "reasoning",
        promptVersion: "report"
      })),
      repairReport: vi.fn(async () => ({
        rawText: safeRaw,
        model: "reasoning",
        promptVersion: "report.repair"
      })),
      chat: vi.fn()
    };

    const report = await buildStrategicReport({ mode: "standard", language: "ru", profile, llm });

    expect(llm.repairReport).toHaveBeenCalled();
    expect(report.rawText).toBe(safeRaw);
  });
});
