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
        metrics: expect.objectContaining({ analyzedPosts: 1 }),
        analysisContext: expect.objectContaining({ selectedPostIds: ["p1"] }),
        qualityFindings: expect.any(Array)
      })
    );
    expect(report.sections).toHaveLength(REQUIRED_SECTIONS.standard.length);
    expect(report.summary.bullets).toEqual(["Резюме из structured output."]);
    expect(report.summary.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("Content quality flags")])
    );
    expect(report.summary.deliveryHealth?.status).toBe("limited");
    expect(report.summary.evidence?.selectedPostIds).toEqual(["p1"]);
    expect(report.analysisContext?.evidenceMap.length).toBeGreaterThan(0);
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
    expect(report.rawText).toContain("Аудитория реагирует на локацию и стиль.");
    expect(report.rawText).not.toContain("романтических отношениях");
  });

  it("allows profile externalUrl as a grounded source", async () => {
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
      externalUrl: "https://example.com/alice",
      isVerified: false,
      relatedProfiles: [],
      posts: [post]
    };
    const raw = fullReportRaw({ sourceLine: "- profile link: https://example.com/alice" });
    const llm: LlmProvider = {
      analyzeVision: vi.fn(async () => []),
      generateReport: vi.fn(async () => ({
        rawText: raw,
        model: "reasoning",
        promptVersion: "report"
      })),
      chat: vi.fn()
    };

    const report = await buildStrategicReport({ mode: "standard", language: "ru", profile, llm });

    expect(report.summary.warnings.join("\n")).not.toContain("Unresolved grounding flags");
  });

  it("removes fabricated source URLs from sections and sourceMap", async () => {
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
    const raw = fullReportRaw({
      sourceLine:
        "- suspicious source: https://evil.example/fake\n- [p1] факт https://www.instagram.com/p/p1/"
    });
    const llm: LlmProvider = {
      analyzeVision: vi.fn(async () => []),
      generateReport: vi.fn(async () => ({
        rawText: raw,
        model: "reasoning",
        promptVersion: "report"
      })),
      chat: vi.fn()
    };

    const report = await buildStrategicReport({ mode: "standard", language: "ru", profile, llm });

    expect(report.sourceMap.map((source) => source.url)).not.toContain("https://evil.example/fake");
    expect(report.sourceMap.map((source) => source.url)).toContain(
      "https://www.instagram.com/p/p1/"
    );
    expect(report.sections.map((section) => section.content).join("\n")).not.toContain(
      "https://evil.example/fake"
    );
    expect(report.rawText).not.toContain("https://evil.example/fake");
    expect(report.summary.warnings.join("\n")).not.toContain("Unresolved grounding flags: 17");
  });

  it("removes fabricated source URLs from summary bullets", async () => {
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
    const llm: LlmProvider = {
      analyzeVision: vi.fn(async () => []),
      generateReport: vi.fn(async () => ({
        rawText: fullReportRaw(),
        model: "reasoning",
        promptVersion: "report",
        summaryBullets: [
          "Grounded public post https://www.instagram.com/p/p1/ and fabricated source https://evil.example/fake"
        ]
      })),
      chat: vi.fn()
    };

    const report = await buildStrategicReport({ mode: "standard", language: "ru", profile, llm });

    expect(report.summary.bullets[0]).toContain("https://www.instagram.com/p/p1/");
    expect(report.summary.bullets[0]).not.toContain("https://evil.example/fake");
    expect(report.summary.bullets[0]).toContain("[removed unverified source]");
  });

  it("cleans internal schema names from summary bullets", async () => {
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
    const raw = fullReportRaw();
    const llm: LlmProvider = {
      analyzeVision: vi.fn(async () => []),
      generateReport: vi.fn(async () => ({
        rawText: raw,
        model: "reasoning",
        promptVersion: "report",
        summaryBullets: ["contentClusters и audienceSignals дают strongest signals по postIds."]
      })),
      repairReport: vi.fn(async () => ({
        rawText: raw,
        model: "reasoning",
        promptVersion: "report.repair"
      })),
      chat: vi.fn()
    };

    const report = await buildStrategicReport({ mode: "standard", language: "ru", profile, llm });

    expect(report.summary.bullets[0]).toBe(
      "тематические кластеры и сигналы аудитории дают самые сильные сигналы по ID постов."
    );
  });

  it("repairs structurally valid reports when practical sections are too thin", async () => {
    const post: InstagramPost = {
      id: "p1",
      type: "Image",
      caption: "coffee workshop and city walk",
      hashtags: [],
      mentions: [],
      likesCount: 40,
      commentsCount: 4,
      latestComments: [
        {
          ownerUsername: "viewer",
          text: "Где это место?",
          timestamp: "2026-06-01T01:00:00Z"
        }
      ],
      timestamp: "2026-06-01T00:00:00Z",
      url: "https://www.instagram.com/p/p1/",
      isPinned: false,
      childPosts: [],
      taggedUsers: []
    };
    const profile: InstagramProfile = {
      username: "alice",
      followersCount: 1000,
      followsCount: 300,
      postsCount: 1,
      isVerified: false,
      relatedProfiles: [],
      posts: [post]
    };
    const thinRaw = REQUIRED_SECTIONS.standard
      .map(
        (title) =>
          `[[SECTION]]\n${title}\n${thinPracticalContent(title)}\nEvidence:\n- [p1] public post: факт https://www.instagram.com/p/p1/`
      )
      .join("\n\n");
    const repairedRaw = fullReportRaw();
    const llm: LlmProvider = {
      analyzeVision: vi.fn(async () => [
        {
          postId: "p1",
          status: "completed" as const,
          description:
            "[Image ID: p1] coffee workshop table, city street, public caption context and visible object details",
          model: "vision",
          promptVersion: "vision"
        }
      ]),
      generateReport: vi.fn(async () => ({
        rawText: thinRaw,
        model: "reasoning",
        promptVersion: "report"
      })),
      repairReport: vi.fn(async () => ({
        rawText: repairedRaw,
        model: "reasoning",
        promptVersion: "report.repair"
      })),
      chat: vi.fn()
    };

    const report = await buildStrategicReport({ mode: "standard", language: "ru", profile, llm });

    expect(llm.repairReport).toHaveBeenCalledWith(
      expect.objectContaining({
        missingSections: [],
        qualityFindings: expect.arrayContaining([
          expect.stringContaining("content:weak_practical_detail")
        ])
      })
    );
    expect(report.rawText).toContain("[[SECTION]]\nГотовые фразы для входа в диалог");
    expect(report.rawText).toContain("Вердикт: профиль дает достаточно публичных сигналов");
    expect(report.promptVersion).toBe("report.repair");
  });

  it("repairs reports with a single missing-source section", async () => {
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
    const rawWithOneMissingSource = REQUIRED_SECTIONS.standard
      .map((title) => {
        const source =
          title === "Ошибки, слепые зоны, барьеры"
            ? ""
            : "\nEvidence:\n- [p1] факт https://www.instagram.com/p/p1/";
        return `[[SECTION]]\n${title}\n${richPracticalContent(title)}${source}`;
      })
      .join("\n\n");
    const repairedRaw = fullReportRaw();
    const llm: LlmProvider = {
      analyzeVision: vi.fn(async () => []),
      generateReport: vi.fn(async () => ({
        rawText: rawWithOneMissingSource,
        model: "reasoning",
        promptVersion: "report"
      })),
      repairReport: vi.fn(async () => ({
        rawText: repairedRaw,
        model: "reasoning",
        promptVersion: "report.repair"
      })),
      chat: vi.fn()
    };

    const report = await buildStrategicReport({ mode: "standard", language: "ru", profile, llm });

    expect(llm.repairReport).toHaveBeenCalledWith(
      expect.objectContaining({
        weakSourceSections: ["Ошибки, слепые зоны, барьеры"],
        qualityFindings: expect.arrayContaining([expect.stringContaining("no extracted source")])
      })
    );
    expect(report.promptVersion).toBe("report.repair");
    expect(report.sourceMap.length).toBeGreaterThan(0);
  });

  it("runs targeted ship-gate repair after general repair leaves weak practical sections", async () => {
    const post: InstagramPost = {
      id: "p1",
      type: "Image",
      caption: "coffee workshop and city walk",
      hashtags: [],
      mentions: [],
      likesCount: 40,
      commentsCount: 4,
      latestComments: [],
      timestamp: "2026-06-01T00:00:00Z",
      url: "https://www.instagram.com/p/p1/",
      isPinned: false,
      childPosts: [],
      taggedUsers: []
    };
    const profile: InstagramProfile = {
      username: "alice",
      followersCount: 1000,
      followsCount: 300,
      postsCount: 18,
      isVerified: false,
      relatedProfiles: [],
      posts: [post]
    };
    const thinRaw = REQUIRED_SECTIONS.standard
      .map(
        (title) =>
          `[[SECTION]]\n${title}\n${thinPracticalContent(title)}\nEvidence:\n- [p1] факт https://www.instagram.com/p/p1/`
      )
      .join("\n\n");
    const repairReport = vi
      .fn()
      .mockResolvedValueOnce({
        rawText: thinRaw,
        model: "reasoning",
        promptVersion: "report.repair"
      })
      .mockResolvedValueOnce({
        rawText: fullReportRaw(),
        model: "reasoning",
        promptVersion: "report.repair.targeted"
      });
    const llm: LlmProvider = {
      analyzeVision: vi.fn(async () => []),
      generateReport: vi.fn(async () => ({
        rawText: thinRaw,
        model: "reasoning",
        promptVersion: "report"
      })),
      repairReport,
      chat: vi.fn()
    };

    const report = await buildStrategicReport({ mode: "standard", language: "ru", profile, llm });

    expect(repairReport).toHaveBeenCalledTimes(2);
    expect(repairReport).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        repairMode: "targeted",
        targetSectionTitles: expect.arrayContaining(["Коммуникационные рекомендации"]),
        shipGateReasons: expect.arrayContaining([expect.stringContaining("content_quality_score")])
      })
    );
    expect(report.promptVersion).toBe("report.repair.targeted");
    expect(report.summary.deliveryHealth?.status).toBe("ready");
  });

  it("marks the report as failed_quality when targeted repair cannot clear hard blockers", async () => {
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
    const unsafeRaw = REQUIRED_SECTIONS.standard
      .map(
        (title) =>
          `[[SECTION]]\n${title}\nПрофиль полезен для production deploy pipeline проверки. Confidence: medium.\nEvidence:\n- [p1] факт https://www.instagram.com/p/p1/`
      )
      .join("\n\n");
    const repairReport = vi.fn(async () => ({
      rawText: unsafeRaw,
      model: "reasoning",
      promptVersion: "report.repair"
    }));
    const llm: LlmProvider = {
      analyzeVision: vi.fn(async () => []),
      generateReport: vi.fn(async () => ({
        rawText: unsafeRaw,
        model: "reasoning",
        promptVersion: "report"
      })),
      repairReport,
      chat: vi.fn()
    };

    const report = await buildStrategicReport({ mode: "standard", language: "ru", profile, llm });

    expect(repairReport).toHaveBeenCalledTimes(2);
    expect(report.summary.deliveryHealth?.status).toBe("failed_quality");
    expect(report.summary.deliveryHealth?.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining("high_findings")])
    );
  });

  it("adds profile-level evidence to final source-less sections", async () => {
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
    const rawWithMissingSource = REQUIRED_SECTIONS.standard
      .map((title) => {
        const source =
          title === "Профессия и статус"
            ? ""
            : "\nEvidence:\n- [p1] факт https://www.instagram.com/p/p1/";
        return `[[SECTION]]\n${title}\n${richPracticalContent(title)}${source}`;
      })
      .join("\n\n");
    const llm: LlmProvider = {
      analyzeVision: vi.fn(async () => []),
      generateReport: vi.fn(async () => ({
        rawText: rawWithMissingSource,
        model: "reasoning",
        promptVersion: "report"
      })),
      chat: vi.fn()
    };

    const report = await buildStrategicReport({ mode: "standard", language: "ru", profile, llm });
    const profession = report.sections.find((section) => section.title === "Профессия и статус");

    expect(profession?.sources).toEqual([
      {
        url: "https://www.instagram.com/alice/",
        label: "Публичный профиль и выбранная публичная выборка"
      }
    ]);
    expect(profession?.content).toContain("https://www.instagram.com/alice/");
    expect(report.sourceMap.map((source) => source.url)).toContain(
      "https://www.instagram.com/alice/"
    );
    expect(report.summary.quality?.findings.map((finding) => finding.id)).not.toContain(
      "section:Профессия и статус:missing_source"
    );
  });

  it("cleans internal schema names from final section content and raw text", async () => {
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
    const raw = REQUIRED_SECTIONS.standard
      .map((title) => {
        const content =
          title === "Профессия и статус"
            ? "Явных публичных указаний на профессию нет.\n\nCaveats:\n- No profession hints in profileSignals or selected posts"
            : richPracticalContent(title);
        return `[[SECTION]]\n${title}\n${content}\nEvidence:\n- [p1] факт https://www.instagram.com/p/p1/`;
      })
      .join("\n\n");
    const llm: LlmProvider = {
      analyzeVision: vi.fn(async () => []),
      generateReport: vi.fn(async () => ({
        rawText: raw,
        model: "reasoning",
        promptVersion: "report"
      })),
      chat: vi.fn()
    };

    const report = await buildStrategicReport({ mode: "standard", language: "ru", profile, llm });
    const profession = report.sections.find((section) => section.title === "Профессия и статус");

    expect(profession?.content).not.toContain("profileSignals");
    expect(report.rawText).not.toContain("profileSignals");
    expect(profession?.content).toContain("прямых признаков профессии");
    expect(report.summary.quality?.findings.map((finding) => finding.id)).not.toContain(
      "report:internal_schema_term_leak"
    );
  });

  it("exposes the content-quality rubric in the report summary", async () => {
    const post: InstagramPost = {
      id: "p1",
      type: "Image",
      caption: "coffee workshop and city walk",
      hashtags: [],
      mentions: [],
      likesCount: 40,
      commentsCount: 4,
      latestComments: [],
      timestamp: "2026-06-01T00:00:00Z",
      url: "https://www.instagram.com/p/p1/",
      isPinned: false,
      childPosts: [],
      taggedUsers: []
    };
    const profile: InstagramProfile = {
      username: "alice",
      followersCount: 1000,
      followsCount: 300,
      postsCount: 1,
      isVerified: false,
      relatedProfiles: [],
      posts: [post]
    };
    const llm: LlmProvider = {
      analyzeVision: vi.fn(async () => []),
      generateReport: vi.fn(async () => ({
        rawText: fullReportRaw(),
        model: "reasoning",
        promptVersion: "report"
      })),
      chat: vi.fn()
    };

    const report = await buildStrategicReport({ mode: "standard", language: "ru", profile, llm });

    expect(report.summary.contentQuality?.score).toBeTypeOf("number");
    expect(report.summary.contentQuality?.dimensions.practicalDetail).toBeTypeOf("number");
    expect(Array.isArray(report.summary.contentQuality?.findings)).toBe(true);
  });
});

function fullReportRaw(input: { sourceLine?: string } = {}): string {
  const sourceLine = input.sourceLine ?? "- [p1] факт https://www.instagram.com/p/p1/";
  return REQUIRED_SECTIONS.standard
    .map(
      (title) => `[[SECTION]]\n${title}\n${richPracticalContent(title)}\nEvidence:\n${sourceLine}`
    )
    .join("\n\n");
}

function thinPracticalContent(title: string): string {
  if (
    title === "Потенциальная польза от контакта" ||
    title === "Триггеры и зацепки" ||
    title === "Коммуникационные рекомендации" ||
    title === "Готовые фразы для входа в диалог" ||
    title === "Общая оценка ценности профиля"
  ) {
    return "Есть полезный сигнал, но практических деталей мало. Confidence: medium. Caveat: public data only.";
  }
  return "Наблюдение опирается на публичный пост, комментарий, vision и metrics. Confidence: medium. Caveat: public data only.";
}

function richPracticalContent(title: string): string {
  if (title === "Потенциальная польза от контакта") {
    return "Confidence: medium. Профиль полезен как источник мягкого входа через публичные интересы: caption про городской маршрут, vision с кофейным столом и комментарий с вопросом о месте дают безопасную тему, которая не залезает в личную жизнь. Почему это важно: пользователь получает повод начать диалог не с оценки внешности, а с конкретного общего контекста. Сценарий 1: уточнить место. Сценарий 2: спросить о формате прогулки. Сценарий 3: обменяться рекомендациями. Первый шаг: один короткий вопрос по посту. Caveat: готовность к контакту не выводится из постов.";
  }
  if (title === "Триггеры и зацепки") {
    return "Confidence: medium. 1. Зацепка по локации: спросить, где находится место из публичного поста, потому что комментарии уже показывают интерес к географии. 2. Зацепка по объекту: отметить кофейный стол или мастерскую из vision как нейтральную деталь, не превращая это в личную оценку. 3. Зацепка по маршруту: аккуратно спросить, есть ли у автора любимые городские точки. Caveat: не использовать приватные предположения и не давить повторными сообщениями.";
  }
  if (title === "Коммуникационные рекомендации") {
    return "Confidence: medium. Начинать лучше коротко и предметно: сначала сослаться на публичный пост, затем задать один открытый вопрос, потом оставить пространство не отвечать. Сценарий 1: комментарий про локацию. Сценарий 2: ответ на уже видимый интерес в комментариях. Сценарий 3: обмен похожим опытом без самопродажи. Второй шаг: если ответ есть, развивать тему через рекомендации по месту или формату прогулки. Не писать: давление, флирт, оценки внешности, вопросы о личной жизни и выводы о статусе. Stop condition: если реакции нет, не повторять сообщение. Caveat: стиль личной переписки неизвестен.";
  }
  if (title === "Готовые фразы для входа в диалог") {
    return "Confidence: medium. «Привет! Увидел пост с городским маршрутом: можешь подсказать, где это место?» «Классная деталь с кофейным столом в посте, похоже на спокойный формат выходного. Есть любимые точки в этом районе?» «В комментариях спрашивали про локацию, мне тоже стало интересно: это больше прогулка или конкретное место?» Эти фразы безопасны, потому что опираются на публичный пост, а не на внешность или личные догадки. Не писать вторую фразу без ответа; если реакции нет, контакт лучше не продолжать. Caveat: отправлять одну фразу, без серии повторов.";
  }
  if (title === "Общая оценка ценности профиля") {
    return "Confidence: medium. Вердикт: профиль дает достаточно публичных сигналов для уважительного первого контакта, но недостаточно для сильных выводов о личности или намерениях. Практическая ценность в том, что есть несколько безопасных тем: город, места, визуальные детали и комментарии. Первый шаг: выбрать одну публично подтвержденную фразу и задать один вопрос. Что не делать: не строить выводы о статусе, отношениях или готовности к общению. Stop condition: если реакции нет или ответ сухой, контакт не продолжать. Главный лимит: выборка не показывает сторис или личные ответы.";
  }
  return "Confidence: medium. Наблюдение строится на публичном посте, caption, vision, комментариях и metrics: повторяется городской контекст, предметная визуальная деталь и мягкий интерес аудитории к месту. Практический смысл в том, что профиль лучше читать как selected public-post read, а не как полную картину человека. Рекомендация: использовать только подтвержденные темы, прямо признавать ограниченность выборки и не делать выводов о приватной жизни. Caveat: посты, сторис и личные ответы вне выборки не анализировались.";
}
