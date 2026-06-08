import { describe, expect, it } from "vitest";
import { evaluateReportContentQuality } from "../../src/modules/analysis/content-quality.js";
import type { ReportMetrics, ReportSectionView } from "../../src/modules/reports/types.js";

describe("content quality rubric", () => {
  it("scores practical, evidence-backed, confidence-calibrated content highly", () => {
    const quality = evaluateReportContentQuality({
      executiveSummary:
        "What this means: recent 30-post read, coverage 30/120 posts, vision 30/30, comment text 40. Confidence is medium because public data and sample limits apply.",
      warnings: [
        "Report format: recent 30-post read; sample coverage 25% (30/120). Findings describe selected public posts."
      ],
      sections: [
        section({
          content:
            "Confidence: medium. Caveat: this is a hypothesis from public data, not private certainty; the limited sample and coverage constrain the conclusion. Vision, comment text, metrics, likes, caption patterns, подписчики, комментарии and ER all point to the same practical reading. Recommendation: start with a soft hook, use a concrete phrase, avoid generic outreach, and explain why the observation is useful."
        })
      ],
      metrics: metrics({ postsCount: 120, analyzedPosts: 30 })
    });

    expect(quality.score).toBeGreaterThanOrEqual(75);
    expect(quality.findings).toEqual([]);
    expect(quality.dimensions.practicalValue).toBeGreaterThanOrEqual(50);
    expect(quality.dimensions.confidenceCalibration).toBeGreaterThanOrEqual(60);
  });

  it("flags generic content that has sources but little user-facing value", () => {
    const quality = evaluateReportContentQuality({
      sections: [
        section({
          content:
            "Профиль выглядит интересным и активным. Можно сделать вывод, что человек публикует разные материалы.",
          sources: [{ postId: "p1", label: "Public post" }]
        })
      ],
      metrics: metrics({ postsCount: 1087, analyzedPosts: 30 })
    });

    expect(quality.score).toBeLessThan(50);
    expect(quality.findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining([
        "content:low_specificity",
        "content:low_practical_value",
        "content:weak_confidence_calibration",
        "content:missing_low_coverage_framing"
      ])
    );
  });

  it("requires low-coverage account conclusions to be framed as a recent-post read", () => {
    const quality = evaluateReportContentQuality({
      executiveSummary:
        "Что это значит: это recent 30-post read по публичным данным. Покрытие 30/1087 постов, coverage 2.8%, vision 30/30, текстовых комментариев 70.",
      warnings: [
        "Формат отчёта: recent 30-post read; покрытие выборки 2.8% (30/1087). Выводы описывают выбранные публичные посты, а не весь профиль."
      ],
      sections: [
        section({
          content:
            "Confidence: medium; ограничение выборки важно. Vision, комментарии, metrics, лайки и caption дают конкретный сигнал. Рекомендация: начинать с наблюдения, использовать зацепку, избегать слишком личных выводов, формулировать практичный вывод и полезный next step."
        })
      ],
      metrics: metrics({ postsCount: 1087, analyzedPosts: 30 })
    });

    expect(quality.findings.map((finding) => finding.id)).not.toContain(
      "content:missing_low_coverage_framing"
    );
    expect(quality.dimensions.healthTransparency).toBeGreaterThanOrEqual(60);
  });

  it("penalizes short key sections and weak practical detail even when every section has a source", () => {
    const titles = [
      "Основные темы и приоритеты",
      "Повторяющиеся визуальные и текстовые паттерны",
      "Поведение и вовлеченность",
      "Аудитория и комментарии",
      "Стиль общения",
      "Профессия и статус",
      "Отличие от типичных аккаунтов",
      "Отсутствия как сигнал",
      "Потенциальная польза от контакта",
      "Триггеры и зацепки",
      "Коммуникационные рекомендации",
      "Готовые фразы для входа в диалог",
      "Неочевидные наблюдения",
      "Общая оценка ценности профиля",
      "Поведенческие сигналы",
      "Ошибки, слепые зоны, барьеры",
      "Образ как у бренда"
    ];
    const quality = evaluateReportContentQuality({
      executiveSummary:
        "Что это значит: near-full public-post read. Покрытие 22/23, vision 22/22, comment coverage 16/22. Confidence medium.",
      sections: titles.map((title) =>
        section({
          title,
          content: shortUsefulButThinContent(title)
        })
      ),
      metrics: metrics({ postsCount: 23, analyzedPosts: 22 })
    });

    expect(quality.score).toBeLessThan(90);
    expect(quality.findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining([
        "content:key_sections_too_short",
        "content:weak_practical_detail"
      ])
    );
  });
});

function section(input: Partial<ReportSectionView>): ReportSectionView {
  return {
    title: input.title ?? "Общая оценка ценности профиля",
    content: input.content ?? "",
    sources: input.sources ?? [
      {
        postId: "p1",
        url: "https://www.instagram.com/p/p1/",
        label: "Public post"
      }
    ]
  };
}

function metrics(input: { postsCount: number; analyzedPosts: number }): ReportMetrics {
  return {
    followersCount: 1000,
    followsCount: 500,
    postsCount: input.postsCount,
    analyzedPosts: input.analyzedPosts,
    avgLikes: 20,
    avgComments: 2,
    medianLikes: 18,
    medianComments: 1,
    engagementRate: 2.2,
    frequencyDays: 4,
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
  };
}

function shortUsefulButThinContent(title: string): string {
  if (title === "Готовые фразы для входа в диалог") {
    return "Фразы должны быть нейтральными и привязанными к публичным постам. Confidence: medium. Evidence: post metadata.";
  }
  if (
    title === "Триггеры и зацепки" ||
    title === "Коммуникационные рекомендации" ||
    title === "Общая оценка ценности профиля"
  ) {
    return "Есть практический сигнал, но деталей мало. Confidence: medium. Evidence: public post.";
  }
  return "Concrete public evidence from caption, vision, comments, metrics and лайки supports this signal. Confidence: medium. Caveat: public data only.";
}
